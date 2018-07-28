const knex = appRequire('init/knex').knex;
const serverManager = appRequire('plugins/flowSaver/server');
const manager = appRequire('services/manager');
const checkAccount = appRequire('plugins/account/checkAccount');
const config = appRequire('services/config').all();
const macAccount = appRequire('plugins/macAccount/index');
const orderPlugin = appRequire('plugins/webgui_order');
const accountFlow = appRequire('plugins/account/accountFlow');

const addAccount = async (type, options) => {
  await checkAccount.deleteCheckAccountTimePort(options.port);
  if(type === 6 || type === 7) {
    type = 3;
  }
  if(type === 1) {
    const [ accountId ] = await knex('account_plugin').insert({
      type,
      orderId: 0,
      userId: options.user,
      port: options.port,
      password: options.password,
      status: 0,
      server: options.server ? options.server : null,
      autoRemove: 0,
    });
    await accountFlow.add(accountId);
    // await checkAccount.checkServer();
    return;
  } else if (type >= 2 && type <= 5) {
    const [ accountId ] = await knex('account_plugin').insert({
      type,
      orderId: options.orderId || 0,
      userId: options.user,
      port: options.port,
      password: options.password,
      data: JSON.stringify({
        create: options.time || Date.now(),
        flow: options.flow || 1 * 1000 * 1000 * 1000,
        limit: options.limit || 1,
      }),
      status: 0,
      server: options.server ? options.server : null,
      autoRemove: options.autoRemove || 0,
      multiServerFlow: options.multiServerFlow || 0,
    });
    await accountFlow.add(accountId);
    // await checkAccount.checkServer();
    return;
  }
};

const changePort = async (id, port) => {
  const result = await knex('account_plugin').update({ port }).where({ id });
  await accountFlow.edit(id);
  // await checkAccount.checkServer();
};

const getAccount = async (options = {}) => {
  const where = {};
  if(options.id) {
    where['account_plugin.id'] = options.id;
  }
  if(options.userId) {
    where['user.id'] = options.userId;
  }
  if(options.port) {
    where['account_plugin.port'] = options.port;
  }
  if(options.group >= 0) {
    where['user.group'] = options.group;
  }
  const account = await knex('account_plugin').select([
    'account_plugin.id',
    'account_plugin.type',
    'account_plugin.orderId',
    'account_plugin.userId',
    'account_plugin.server',
    'account_plugin.port',
    'account_plugin.password',
    'account_plugin.data',
    'account_plugin.status',
    'account_plugin.autoRemove',
    'account_plugin.multiServerFlow',
    'user.id as userId',
    'user.email as user',
  ])
  .leftJoin('user', 'user.id', 'account_plugin.userId')
  .where(where);
  return account;
};

const delAccount = async id => {
  const accountInfo = await knex('account_plugin').where({ id }).then(s => s[0]);
  if(!accountInfo) {
    return Promise.reject('Account id[' + id + '] not found');
  }
  const result = await knex('account_plugin').delete().where({ id });
  const servers = await knex('server').where({});
  servers.forEach(server => {
    manager.send({
      command: 'del',
      port: accountInfo.port + server.shift,
    }, {
      host: server.host,
      port: server.port,
      password: server.password,
    });
  });
  await accountFlow.del(id);
  // await checkAccount.checkServer();
  return result;
};

const editAccount = async (id, options) => {
  if(options.port) {
    await checkAccount.deleteCheckAccountTimePort(options.port);
  }
  const account = await knex('account_plugin').where({ id }).then(success => {
    if(success.length) {
      return success[0];
    }
    return Promise.reject('account not found');
  });
  const update = {};
  update.type = options.type;
  update.orderId = options.orderId;
  update.userId = options.userId;
  update.autoRemove = options.autoRemove;
  update.multiServerFlow = options.multiServerFlow;
  if(options.hasOwnProperty('server')) {
    update.server = options.server ? JSON.stringify(options.server) : null;
  }
  if(options.type === 1) {
    update.data = null;
    // update.port = +options.port;
  } else if(options.type >= 2 && options.type <= 5) {
    update.data = JSON.stringify({
      create: options.time || Date.now(),
      flow: options.flow || 1 * 1000 * 1000 * 1000,
      limit: options.limit || 1,
    });
    // update.port = +options.port;
  }
  if(options.port) {
    update.port = +options.port;
    if(+options.port !== account.port) {
      const servers = await knex('server').where({});
      servers.forEach(server => {
        manager.send({
          command: 'del',
          port: account.port + server.shift,
        }, {
          host: server.host,
          port: server.port,
          password: server.password,
        });
      });
    }
  }
  await knex('account_plugin').update(update).where({ id });
  await await accountFlow.edit(id);
  // await checkAccount.checkServer();
  return;
};

const editAccountTime = async (id, timeString, check) => {
  const time = +timeString;
  let accountInfo = await knex('account_plugin').where({ id }).then(s => s[0]);
  if(accountInfo.type < 2 || accountInfo.type > 5) { return; }
  accountInfo.data = JSON.parse(accountInfo.data);
  const timePeriod = {
    '2': 7 * 86400 * 1000,
    '3': 30 * 86400 * 1000,
    '4': 1 * 86400 * 1000,
    '5': 3600 * 1000,
  };
  accountInfo.data.create += time;
  while(time > 0 && accountInfo.data.create >= Date.now()) {
    accountInfo.data.limit += 1;
    accountInfo.data.create -= timePeriod[accountInfo.type];
  }
  await knex('account_plugin').update({
    data: JSON.stringify(accountInfo.data)
  }).where({ id });
  if(check) {
    await checkAccount.deleteCheckAccountTimePort(accountInfo.port);
  }
};

const editAccountTimeForRef = async (id, timeString, check) => {
  const time = +timeString;
  let accountInfo = await knex('account_plugin').where({ id }).then(s => s[0]);
  if(accountInfo.type < 2 || accountInfo.type > 5) { return; }
  accountInfo.data = JSON.parse(accountInfo.data);
  const timePeriod = {
    '2': 7 * 86400 * 1000,
    '3': 30 * 86400 * 1000,
    '4': 1 * 86400 * 1000,
    '5': 3600 * 1000,
  };
  if(accountInfo.data.create + timePeriod[accountInfo.type] * accountInfo.data.limit <= Date.now()) {
    accountInfo.data.limit = 1;
    accountInfo.data.create = Date.now() + time - timePeriod[accountInfo.type];
  } else {
    accountInfo.data.create += time;
  }
  while(time > 0 && accountInfo.data.create >= Date.now()) {
    accountInfo.data.limit += 1;
    accountInfo.data.create -= timePeriod[accountInfo.type];
  }
  await knex('account_plugin').update({
    data: JSON.stringify(accountInfo.data)
  }).where({ id });
  if(check) {
    await checkAccount.deleteCheckAccountTimePort(accountInfo.port);
  }
};

const changePassword = async (id, password) => {
  const account = await knex('account_plugin').select().where({ id }).then(success => {
    if(success.length) {
      return success[0];
    }
    return Promise.reject('account not found');
  });
  await knex('account_plugin').update({
    password,
  }).where({ id });
  await checkAccount.changePassword(id, password);
  return;
};

const addAccountLimit = async (id, number = 1) => {
  const account = await knex('account_plugin').select().where({ id }).then(success => {
    if(success.length) {
      return success[0];
    }
    return Promise.reject('account not found');
  });
  if(account.type < 2 || account.type > 5) { return; }
  const accountData = JSON.parse(account.data);
  const timePeriod = {
    '2': 7 * 86400 * 1000,
    '3': 30 * 86400 * 1000,
    '4': 1 * 86400 * 1000,
    '5': 3600 * 1000,
  };
  if(accountData.create + accountData.limit * timePeriod[account.type] <= Date.now()) {
    accountData.create = Date.now();
    accountData.limit = number;
  } else {
    accountData.limit += number;
  }
  await knex('account_plugin').update({
    data: JSON.stringify(accountData),
  }).where({ id });
  return;
};

const addAccountLimitToMonth = async (userId, accountId, number = 1) => {
  if(!accountId) {
    const port = await knex('account_plugin').select()
    .orderBy('port', 'DESC').limit(1)
    .then(success => {
      if(success.length) {
        return success[0].port + 1;
      } else {
        return 50000;
      }
    });
    await addAccount(3, {
      user: userId,
      port,
      password: Math.random().toString().substr(2,10),
      time: Date.now(),
      limit: number,
      flow: 200 * 1000 * 1000 * 1000,
      autoRemove: 0,
    });
    return;
  }
  const account = await knex('account_plugin').select().where({ id: accountId }).then(success => {
    if(success.length) {
      return success[0];
    }
    return Promise.reject('account not found');
  });
  if(account.type < 2 || account.type > 5) { return; }
  const accountData = JSON.parse(account.data);
  accountData.flow = 200 * 1000 * 1000 * 1000;
  if(account.type === 3) {
    if(accountData.create + accountData.limit * 30 * 86400 * 1000 <= Date.now()) {
      accountData.create = Date.now();
      accountData.limit = number;
    } else {
      accountData.limit += number;
    }
  } else {
    const timePeriod = {
      '2': 7 * 86400 * 1000,
      '3': 30 * 86400 * 1000,
      '4': 1 * 86400 * 1000,
      '5': 3600 * 1000,
    };
    let expireTime = accountData.create + accountData.limit * timePeriod[account.type];
    if(expireTime <= Date.now()) {
      expireTime = 30 * 86400 * 1000 * number + Date.now();
    } else {
      expireTime += 30 * 86400 * 1000 * number;
    }
    accountData.create = expireTime;
    accountData.limit = 0;
    while(accountData.create >= Date.now()) {
      accountData.limit += 1;
      accountData.create -= 30 * 86400 * 1000;
    }
  }
  await knex('account_plugin').update({
    type: 3,
    data: JSON.stringify(accountData),
    autoRemove: 0,
  }).where({ id: accountId });
  return;
};

const setAccountLimit = async (userId, accountId, orderId) => {
  const orderInfo = await orderPlugin.getOneOrder(orderId);
  const payType = {
    week: 2, month: 3, day: 4, hour: 5, season: 6, year: 7,
  };
  let paymentType;
  const limit = orderInfo.cycle;
  const orderType = orderInfo.type;
  const flow = {};
  let account;
  if(accountId) {
    account = await knex('account_plugin').select().where({ id: accountId }).then(success => {
      if(success.length) {
        return success[0];
      }
      return null;
    });
  }
  if(!accountId || !account) {
    const getNewPort = () => {
      return knex('webguiSetting').select().where({
        key: 'account',
      }).then(success => {
        if(!success.length) { return Promise.reject('settings not found'); }
        success[0].value = JSON.parse(success[0].value);
        return success[0].value.port;
      }).then(port => {
        if(port.random) {
          const getRandomPort = () => Math.floor(Math.random() * (port.end - port.start + 1) + port.start);
          let retry = 0;
          let myPort = getRandomPort();
          const checkIfPortExists = port => {
            let myPort = port;
            return knex('account_plugin').select()
            .where({ port }).then(success => {
              if(success.length && retry <= 30) {
                retry++;
                myPort = getRandomPort();
                return checkIfPortExists(myPort);
              } else if (success.length && retry > 30) {
                return Promise.reject('Can not get a random port');
              } else {
                return myPort;
              }
            });
          };
          return checkIfPortExists(myPort);
        } else {
          // return knex('account_plugin').select()
          // .whereBetween('port', [port.start, port.end])
          // .orderBy('port', 'DESC').limit(1).then(success => {
          //   if(success.length) {
          //     return success[0].port + 1;
          //   }
          //   return port.start;
          // });
          return knex('account_plugin').select()
          .whereBetween('port', [port.start, port.end])
          .orderBy('port', 'ASC').then(success => {
            const portArray = success.map(m => m.port);
            let myPort;
            for(let p = port.start; p <= port.end; p++) {
              if(portArray.indexOf(p) < 0) {
                myPort = p; break;
              }
            }
            if(myPort) {
              return myPort;
            } else {
              return Promise.reject('no port');
            }
          });
        }
      });
    };
    const port = await getNewPort();
    await addAccount(orderType, {
      orderId,
      user: userId,
      port,
      password: Math.random().toString().substr(2,10),
      time: Date.now(),
      limit,
      flow: orderInfo.flow,
      server: orderInfo.server,
      autoRemove: orderInfo.autoRemove ? 1 : 0,
      multiServerFlow: orderInfo.multiServerFlow ? 1 : 0,
    });
    return;
  }
  const accountData = JSON.parse(account.data);
  accountData.flow = orderInfo.flow;
  const timePeriod = {
    '2': 7 * 86400 * 1000,
    '3': 30 * 86400 * 1000,
    '4': 1 * 86400 * 1000,
    '5': 3600 * 1000,
    '6': 3 * 30 * 86400 * 1000,
    '7': 12 * 30 * 86400 * 1000,
  };
  let expireTime = accountData.create + accountData.limit * timePeriod[account.type];
  if(expireTime <= Date.now()) {
    expireTime = timePeriod[orderType] * limit + Date.now();
  } else {
    expireTime += timePeriod[orderType] * limit;
  }
  let countTime = timePeriod[orderType];
  if(orderType === 6) { countTime = timePeriod[3]; }
  if(orderType === 7) { countTime = timePeriod[3]; }
  accountData.create = expireTime - countTime;
  accountData.limit = 1;
  while(accountData.create >= Date.now()) {
    accountData.limit += 1;
    accountData.create -= countTime;
  }
  let port = await getAccount({ id: accountId }).then(success => success[0].port);
  await knex('account_plugin').update({
    type: orderType >= 6 ? 3 : orderType,
    orderId,
    data: JSON.stringify(accountData),
    server: orderInfo.server,
    autoRemove: orderInfo.autoRemove ? 1 : 0,
    multiServerFlow: orderInfo.multiServerFlow ? 1 : 0,
  }).where({ id: accountId });
  await checkAccount.deleteCheckAccountTimePort(port);
  return;
};

const addAccountTime = async (userId, accountId, accountType, accountPeriod = 1) => {
  // type: 2 周 ,3 月, 4 天, 5 小时
  const getTimeByType = type => {
    const time = {
      '2': 7 * 24 * 60 * 60 * 1000,
      '3': 30 * 24 * 60 * 60 * 1000,
      '4': 24 * 60 * 60 * 1000,
      '5': 60 * 60 * 1000,
    };
    return time[type];
  };

  const paymentInfo = await knex('webguiSetting').select().where({
    key: 'payment',
  }).then(success => {
    if(!success.length) {
      return Promise.reject('settings not found');
    }
    success[0].value = JSON.parse(success[0].value);
    return success[0].value;
  });
  const getPaymentInfo = type => {
    const pay = {
      '2': 'week',
      '3': 'month',
      '4': 'day',
      '5': 'hour',
    };
    return paymentInfo[pay[type]];
  };
  
  const checkIfAccountExists = async (accountId) => {
    if(!accountId) { return null; }
    const account = await knex('account_plugin').where({ id: accountId });
    if(!account.length) { return null; }
    const accountInfo = account[0];
    accountInfo.data = JSON.parse(account[0].data);
    return accountInfo;
  };
  
  const accountInfo = await checkIfAccountExists(accountId);
  if(!accountInfo) {
    const getNewPort = async () => {
      const port = await knex('webguiSetting').select().where({
        key: 'account',
      }).then(success => {
        if(!success.length) { return Promise.reject('settings not found'); }
        success[0].value = JSON.parse(success[0].value);
        return success[0].value.port;
      });
      if(port.random) {
        const getRandomPort = () => Math.floor(Math.random() * (port.end - port.start + 1) + port.start);
        let retry = 0;
        let myPort = getRandomPort();
        const checkIfPortExists = port => {
          let myPort = port;
          return knex('account_plugin').select()
          .where({ port }).then(success => {
            if(success.length && retry <= 30) {
              retry++;
              myPort = getRandomPort();
              return checkIfPortExists(myPort);
            } else if (success.length && retry > 30) {
              return Promise.reject('Can not get a random port');
            } else {
              return myPort;
            }
          });
        };
        return checkIfPortExists(myPort);
      } else {
        return knex('account_plugin').select()
        .whereBetween('port', [port.start, port.end])
        .orderBy('port', 'DESC').limit(1).then(success => {
          if(success.length) {
            return success[0].port + 1;
          }
          return port.start;
        });
      }
    };
    const port = await getNewPort();
    await knex('account_plugin').insert({
      type: accountType,
      userId,
      server: getPaymentInfo(accountType).server ? JSON.stringify(getPaymentInfo(accountType).server) : null,
      port,
      password: Math.random().toString().substr(2,10),
      data: JSON.stringify({
        create: Date.now(),
        flow: getPaymentInfo(accountType).flow * 1000 * 1000,
        limit: accountPeriod,
      }),
      autoRemove: getPaymentInfo(accountType).autoRemove,
      multiServerFlow: getPaymentInfo(accountType).multiServerFlow,
    });
    return;
  }

  let onlyIncreaseTime = false;
  if(accountInfo.type === 3 && accountType !== 3) { onlyIncreaseTime = true; }
  if(accountInfo.type === 2 && (accountType === 4 || accountType === 5)) { onlyIncreaseTime = true; }
  if(accountInfo.type === 4 && accountType === 5) { onlyIncreaseTime = true; }

  const isAccountOutOfDate = accountInfo => {
    const expire = accountInfo.data.create + accountInfo.data.limit * getTimeByType(accountInfo.type);
    return expire <= Date.now();
  };

  if(onlyIncreaseTime) {
    let expireTime;
    if(isAccountOutOfDate(accountInfo)) {
      expireTime = Date.now() + getTimeByType(accountType) * accountPeriod;
    } else {
      expireTime = accountInfo.data.create + getTimeByType(accountInfo.type) * accountInfo.data.limit + getTimeByType(accountType) * accountPeriod;
    }
    let createTime = expireTime - getTimeByType(accountInfo.type);
    let limit = 1;
    while(createTime >= Date.now()) {
      limit += 1;
      createTime -= getTimeByType(accountInfo.type);
    }
    await knex('account_plugin').update({
      data: JSON.stringify({
        create: createTime,
        flow: accountInfo.data.flow,
        limit,
      }),
    }).where({ id: accountId });
    return;
  }

  let expireTime;
  if(isAccountOutOfDate(accountInfo)) {
    expireTime = Date.now() + getTimeByType(accountType) * accountPeriod;
  } else {
    expireTime = accountInfo.data.create + getTimeByType(accountInfo.type) * accountInfo.data.limit + getTimeByType(accountType) * accountPeriod;
  }
  let createTime = expireTime - getTimeByType(accountType);
  let limit = 1;
  while(createTime >= Date.now()) {
    limit += 1;
    createTime -= getTimeByType(accountType);
  }
  await knex('account_plugin').update({
    type: accountType,
    server: getPaymentInfo(accountType).server ? JSON.stringify(getPaymentInfo(accountType).server) : null,
    data: JSON.stringify({
      create: createTime,
      flow: getPaymentInfo(accountType).flow * 1000 * 1000,
      limit,
    }),
    autoRemove: getPaymentInfo(accountType).autoRemove,
    multiServerFlow: getPaymentInfo(accountType).multiServerFlow,
  }).where({ id: accountId });
  return;
};

const banAccount = async options => {
  const serverId = options.serverId;
  const accountId = options.accountId;
  const time = options.time;
  await knex('account_flow').update({
    status: 'ban',
    nextCheckTime: Date.now(),
    autobanTime: Date.now() + time,
  }).where({
    serverId, accountId,
  });
};

const getBanAccount = async options => {
  const serverId = options.serverId;
  const accountId = options.accountId;
  const accountInfo = await knex('account_flow').select([
    'autobanTime as banTime'
  ]).where({
    serverId, accountId, status: 'ban'
  });
  if(!accountInfo.length) { return { banTime: 0 }; }
  return accountInfo[0];
};

const loginLog = {};
const scanLoginLog = ip => {
  for(let i in loginLog) {
    if(Date.now() - loginLog[i].time >= 10 * 60 * 1000) {
      delete loginLog[i];
    }
  }
  if(!loginLog[ip]) {
    return false;
  } else if (loginLog[ip].mac.length <= 10) {
    return false;
  } else {
    return true;
  }
};
const loginFail = (mac, ip) => {
  if(!loginLog[ip]) {
    loginLog[ip] = { mac: [ mac ], time: Date.now() };
  } else {
    if(loginLog[ip].mac.indexOf(mac) < 0) {
      loginLog[ip].mac.push(mac);
      loginLog[ip].time = Date.now();
    }
  }
};

const getAccountForSubscribe = async (token, ip) => {
  if(scanLoginLog(ip)) {
    return Promise.reject('ip is in black list');
  }
  const account = await knex('account_plugin').where({
    subscribe: token
  }).then(s => s[0]);
  if(!account) {
    loginFail(token, ip);
    return Promise.reject('can not find account');
  }
  if(account.data) {
    account.data = JSON.parse(account.data);
  } else {
    account.data = {};
  }
  const servers = await serverManager.list({ status: false });
  const validServers = servers.filter(server => {
    if(!account.data.server) { return true; }
    return account.data.server.indexOf(server.id) >= 0;
  });
  return { server: validServers, account };
};

exports.addAccount = addAccount;
exports.getAccount = getAccount;
exports.delAccount = delAccount;
exports.editAccount = editAccount;
exports.editAccountTime = editAccountTime;
exports.editAccountTimeForRef = editAccountTimeForRef;

exports.changePassword = changePassword;
exports.changePort = changePort;

exports.addAccountLimit = addAccountLimit;
exports.addAccountLimitToMonth = addAccountLimitToMonth;
exports.setAccountLimit = setAccountLimit;
exports.addAccountTime = addAccountTime;

exports.banAccount = banAccount;
exports.getBanAccount = getBanAccount;

exports.getAccountForSubscribe = getAccountForSubscribe;