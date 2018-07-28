const knex = appRequire('init/knex').knex;
const config = appRequire('services/config').all();

const getOrders = async () => {
  return knex('webgui_order').where({});
};

const getOneOrder = async orderId => {
  const order = await knex('webgui_order').where({ id: orderId }).then(s => s[0]);
  if(!order) { return Promise.reject('order not found'); }
  return order;
};

const getOneOrderByAccountId = async accountId => {
  const order = await knex('webgui_order').select([
    'webgui_order.id as id',
    'webgui_order.changeOrderType as changeOrderType',
  ]).leftJoin('account_plugin', 'account_plugin.orderId', 'webgui_order.id')
  .where({ 'account_plugin.id': accountId }).then(s => s[0]);
  return order;
};

const newOrder = async data => {
  await knex('webgui_order').insert({
    name: data.name,
    comment: data.comment,
    type: data.type,
    cycle: data.cycle,
    alipay: data.alipay,
    paypal: data.paypal,
    flow: data.flow,
    refTime: data.refTime,
    server: data.server ? JSON.stringify(data.server) : null,
    autoRemove: data.autoRemove,
    multiServerFlow: data.multiServerFlow,
    changeOrderType: data.changeOrderType,
  });
  return;
};

const editOrder = async data => {
  await knex('webgui_order').update({
    name: data.name,
    comment: data.comment,
    type: data.type,
    cycle: data.cycle,
    alipay: data.alipay,
    paypal: data.paypal,
    flow: data.flow,
    refTime: data.refTime,
    server: data.server ? JSON.stringify(data.server) : null,
    autoRemove: data.autoRemove,
    multiServerFlow: data.multiServerFlow,
    changeOrderType: data.changeOrderType,
  }).where({
    id: data.id,
  });
  return;
};

const deleteOrder = async orderId => {
  const hasAccount = await knex('account_plugin').where({ orderId });
  if(hasAccount.length) { return Promise.reject('account with this order exists'); }
  const isGiftCardOn = config.plugins.giftcard && config.plugins.giftcard.use;
  const hasGiftcard = isGiftCardOn ? await knex('giftcard').where({ orderType: orderId, status: 'AVAILABLE' }) : [];
  if(hasGiftcard.length) { return Promise.reject('giftcard with this order exists'); }
  await knex('webgui_order').delete().where({ id: orderId });
  return;
};

exports.getOrders = getOrders;
exports.getOneOrder = getOneOrder;
exports.newOrder = newOrder;
exports.editOrder = editOrder;
exports.deleteOrder = deleteOrder;
exports.getOneOrderByAccountId = getOneOrderByAccountId;