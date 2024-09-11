const log4js = require('log4js');
const logger = log4js.getLogger('system');

const dns = require('dns');
const net = require('net');
const crypto = require('crypto');
const config = appRequire('services/config').all();
let host;
let port;
let password;
try {
  host = config.manager.address.split(':')[0];
  port = +config.manager.address.split(':')[1];
  password = config.manager.password;
} catch(err) {

}

const pack = (data, password) => {
  const message = JSON.stringify(data);
  const now = Date.now();
  const timeBuffer = Buffer.from('0' + now.toString(16), 'hex');
  const dataBuffer = Buffer.from(message);
  const length = dataBuffer.length + 4 + 6;
  const lengthBuffer = Buffer.from(('0000' + length.toString(16)).substr(-4), 'hex');
  const code = crypto.createHash('md5').update(now + message + password).digest('hex').substr(0, 8);
  const codeBuffer = Buffer.from(code, 'hex');
  const pack = Buffer.concat([lengthBuffer, timeBuffer, dataBuffer, codeBuffer]);
  return pack;
};

const receiveData = async (receive, data) => {
  receive.data = Buffer.concat([receive.data, data]);
  return checkData(receive);
};

const checkData = async (receive) => {
  const buffer = receive.data;
  let length = 0;
  let data;
  if (buffer.length < 4) {
    return;
  }
  length = buffer[0] * 256 * 256 * 256 + buffer[1] * 256 * 256 + buffer[2] * 256 + buffer[3];
  if (buffer.length >= length + 4) {
    data = buffer.slice(4, length + 4);
    const message = JSON.parse(data.toString());
    return message;
  } else {
    return;
  }
};

const sendMessage = (data, options) => {
  if(options && options.host) {
    options.host = options.host.split(':')[0];
  }
  if(!options) {
    options = { host, port, password };
  }
  const promise = new Promise((resolve, reject) => {
    const client = net.connect(options || {
      host,
      port,
    }, () => {
      client.write(pack(data, (options? options.password: null) || password));
    });
    client.setTimeout(10 * 1000);
    const receive = {
      data: Buffer.from(''),
      socket: client,
    };
    client.on('data', data => {
      receiveData(receive, data).then(message => {
        if(!message) {
          // reject(new Error(`empty message from ssmgr[s] [${ options.host || host }:${ options.port || port }]`));
        } else if(message.code === 0) {
          resolve(message.data);
        } else {
          logger.error(message);
          reject(new Error(`ssmgr[s] return an error code [${ options.host || host }:${ options.port || port }]`));
        }
        client.end();
      }).catch(err => {
        logger.error(err);
        client.end();
      });
    });
    client.on('close', () => {
      reject(new Error(`ssmgr[s] connection close [${ options.host || host }:${ options.port || port }]`));
    });
    client.on('error', err => {
      logger.error(err);
      reject(new Error(`connect to ssmgr[s] fail [${ options.host || host }:${ options.port || port }]`));
    });
    client.on('timeout', () => {
      logger.error('timeout');
      reject(new Error(`connect to ssmgr[s] timeout [${ options.host || host }:${ options.port || port }]`));
      client.end();
    });
  });
  return promise;
};

const getIps = async address => {
  if(net.isIP(address)) {
    return Promise.resolve([ address ]);
  }
  return new Promise((resolve, reject) => {
    dns.resolve4(address, (err, ips) => {
      if(err) {
        return resolve([]);
      }
      if(ips.sort) {
        ips = ips.sort();
      }
      return resolve(ips);
    });
  });
};

const send = async (data, options) => {
  if(options && options.host) {
    options.host = options.host.split(':')[0];
  }
  if(!options) {
    options = { host, port, password };
  }
  const ips = await getIps(options.host);
  if(ips.length === 0) {
    return Promise.reject(`${options.host} invalid ip`);
  } else if(ips.length === 1) {
    return sendMessage(data, options);
  } else {
    const results = await Promise.all(ips.map(ip => {
      return sendMessage(data, {
        host: ip,
        port: options.port,
        password: options.password,
        // availableToDate: options.availableToDate,
      }).catch(err => {
        return null;
      });
    }));
    if(data.command === 'version') {
      let successMark = true;
      const versions = [];
      const ret = { version: '', isGfw: false };
      results.forEach(result => {
        if(result) {
          versions.push(result.version);
          if(result.isGfw) { ret.isGfw = true; }
        } else {
          successMark = false;
        }
      });
      if(versions.length === 1) {
        ret.version = versions[0];
      } else {
        const diff = versions.some((ele, index, arr) => index > 0 && ele !== arr[index - 1]);
        if(diff) {
          ret.version = versions.join(',');
        } else {
          ret.version = versions[0] + ' x ' + versions.length;
        }
      }
      ret.number = versions.length;
      return successMark ? ret : Promise.reject();
    } else if(data.command === 'flow') {
      let successMark = false;
      const flows = {};
      results.forEach(result => {
        if(result) {
          successMark = true;
          result.forEach(f => {
            if(!flows[f.port]) {
              flows[f.port] = f.sumFlow;
            } else {
              flows[f.port] += f.sumFlow;
            }
          });
        }
      });
      const ret = Object.keys(flows).map(m => {
        return { port: +m, sumFlow: flows[m] };
      });
      return successMark ? ret : Promise.reject();
    } else if(data.command === 'list') {
      let successMark = false;
      const ports = {};
      results.forEach(result => {
        if(result) {
          successMark = true;
          result.forEach(f => {
            if(!ports[f.port]) {
              ports[f.port] = { password: f.password, number: 1 };
            } else {
              ports[f.port].number += 1;
            }
          });
        }
      });
      const ret = Object.keys(ports).filter(f => {
        return ports[f].number >= results.filter(f => f).length;
      }).map(m => {
        return { port: +m, password: ports[m].password };
      });
      return successMark ? ret : Promise.reject();
    } else if (data.command === 'checkSub') {
      let successMark = false;
      const availablePorts = {};
      results.forEach((res) => {
        if (res) {
          successMark = true;
          res.forEach((f) => {
            if (!availablePorts[f.port]) {
              availablePorts[f.port] = { availableToDate: f.availableToDate, number: 1 };
            } else {
              availablePorts[f.port].number += 1;
            }
          })
        }
        const ret = Object.keys(availablePorts).filter(f => {
          return availablePorts[f].number >= results.filter(f => f).length;
        }).map(m => {
          return { port: +m, availableToDate: availablePorts[m].availableToDate };
        });
        return successMark ? ret : Promise.reject();
      })
    } else {
      const random = (+Math.random().toString().substr(2, 8)) % results.length;
      return results[random];
    }
  }
};

/*
{
  command: 'add/del/list/pwd/flow/version/ip',
  port: 1234,
  password: '123456',
  options: {
    startTime: xxx
    endTime: xxx
    clear: true
  },
}, {
  host: '',
  port: '',
  password: '',
}
 */
exports.send = send;
