const telegram = appRequire('plugins/telegram/index').telegram;

telegram.on('message', message => {
  if (message.message.text === 'help') {
    let str = '';
    str += `Command:

  auth

  list
  checkSub
  del {port}
  add {port} {password} {date (format: YYYY-MM-DD)}
  pwd {port} {password}

  listserver
  switchserver {id}
  delserver {name}
  addserver {name} {host} {port} {password}
  editserver {name} {newName} {host} {port} {password}

  flow
  flow{number}min
  flow{number}hour

Read more info at https://github.com/shadowsocks/shadowsocks-manager/tree/master/plugins/telegram/README.md
`;
    telegram.emit('send', message, str);
  }
});
