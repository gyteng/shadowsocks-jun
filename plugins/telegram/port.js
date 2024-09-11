const telegram = appRequire('plugins/telegram/index').telegram;
const manager = appRequire('services/manager');
const managerAddress = appRequire('plugins/telegram/managerAddress');
const cron = appRequire('init/cron');

const log4js = require('log4js');
const logger = log4js.getLogger('telegram');

const checkSub = (message) => {
  manager.send({
    command: 'checkSub',
  }, managerAddress.get()).then((avports) => {
    if(avports.length === 0) {
      str = 'No available ports.';
      return;
    } else {
      avports.forEach((port) => {
        const isAvailable = new Date.now() < new new Date(port.availableToDate);
        if (isAvailable) {
          logger.info(`Available port ${port.port} to date ${new Date(new Date(port.availableToDate) - new Date().now()).toDateString()}`);
        } else {
          manager.send({
            command: 'del',
            port,
          }, managerAddress.get())
            .then((succ) => {
              logger.info(succ);
            })
            .catch((err) => {
              logger.error(err);
            });
        }
      })
    }
    if (message) {
      const str = `${managerAddress.get().host}:${managerAddress.get().port}\n\n + ${avports.join('\n')}`;
      telegram.emit('send', message, str);
    }
  }).catch((err) => {
    logger.error(err);
  });
}

const list = (message) => {
  manager.send({
    command: 'list'
  }, managerAddress.get()).then(ports => {
    let str = '';
    if(ports.length === 0) {
      str = 'No ports.';
    } else {
      str += `${managerAddress.get().host}:${managerAddress.get().port}\n\n`;
      ports.forEach(port => {
        str += port.port + ', ' + port.password + '\n';
      });
    }
    telegram.emit('send', message, str);
  }).catch(err => {
    logger.error(err);
  });
};

const add = (message, port, password, availableToDate) => {
  manager.send({
    command: 'add',
    port,
    password,
    availableToDate: Date.parse(availableToDate),
  }, managerAddress.get()).then(success => {
    telegram.emit('send', message, `Add port ${success.port} success.`);
  });
};

const del = (message, port) => {
  manager.send({
    command: 'del',
    port,
  }, managerAddress.get()).then(success => {
    telegram.emit('send', message, `Delete port ${success.port} success.`);
  });
};

const pwd = (message, port, password) => {
  manager.send({
    command: 'pwd',
    port,
    password,
  }, managerAddress.get()).then(success => {
    telegram.emit('send', message, `Change password for port ${success.port} success.`);
  });
};

telegram.on('manager', message => {

  const addReg = new RegExp(/^add (\d{0,5}) ([\w]{0,}) (\d{1,2}\-\d{1,2}\-\d{2,4})$/);
  const delReg = new RegExp(/^del (\d{0,5})$/);
  const pwdReg = new RegExp(/^pwd (\d{0,5}) ([\w]{0,})$/);

  if(message.message.text === 'list') {
    list(message);
  } else if(message.message.text.match(addReg)) {
    const reg = message.message.text.match(addReg);
    const port = +reg[1];
    const password = reg[2];
    const availableToDate = reg[3];
    add(message, port, password, availableToDate);
  } else if(message.message.text.match(delReg)) {
    const reg = message.message.text.match(delReg);
    const port = +reg[1];
    del(message, port);
  } else if(message.message.text.match(pwdReg)) {
    const reg = message.message.text.match(pwdReg);
    const port = +reg[1];
    const password = reg[2];
    pwd(message, port, password);
  } else if (message.message.text === 'checkSub') {
    checkSub(message);
  }
});

cron.minute(() => {
  checkSub()
}, 'CheckSubscription', 1);