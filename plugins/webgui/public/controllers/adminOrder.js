const app = angular.module('app');

app
.controller('AdminOrderSettingController', ['$scope', '$state', '$http',
  ($scope, $state, $http, $filter) => {
    $scope.setTitle('订单设置');
    $scope.setMenuButton('arrow_back', function() {
      $state.go('admin.settings');
    });
    $http.get('/api/admin/order').then(success => {
      $scope.orders = success.data;
    });
    $scope.editOrder = id => {
      $state.go('admin.editOrder', { id });
    };
    $scope.setFabButton(() => {
      $state.go('admin.newOrder');
    });
  }
])
.controller('AdminNewOrderController', ['$scope', '$state', '$http', '$filter',
  ($scope, $state, $http, $filter) => {
    $scope.setTitle('新增订单');
    $scope.setMenuButton('arrow_back', 'admin.order');

    $scope.typeList = [
      { key: '周', value: 2 },
      { key: '月', value: 3 },
      { key: '天', value: 4 },
      { key: '小时', value: 5 },
    ];

    $http.get('/api/admin/server').then(success => {
      $scope.servers = success.data;
    });
    $scope.order = {
      type: 2,
      cycle: 1,
      alipay: 0,
      paypal: 0,
      flow: 100000000,
      refTime: 0,
      autoRemove: 0,
      multiServerFlow: 0,
      changeOrderType: 1,
      server: null,
    };
    $scope.order.flowStr = $filter('flowNum2Str')($scope.order.flow);
    $scope.order.refTimeStr = $filter('timeNum2Str')($scope.order.refTime);
    $scope.orderServer = !!$scope.order.server;
    $scope.orderServerObj = {};
    $scope.cancel = () => { $state.go('admin.order'); };
    $scope.confirm = () => {
      $scope.order.flow = $filter('flowStr2Num')($scope.order.flowStr);
      $scope.order.refTime = $filter('timeStr2Num')($scope.order.refTimeStr);
      console.log($scope.order);
      const server = Object.keys($scope.orderServerObj)
      .map(m => {
        if($scope.orderServerObj[m]) {
          return +m;
        }
      })
      .filter(f => f);
      $scope.order.server = $scope.orderServer ? server : null;
      $http.post('/api/admin/order', {
        name: $scope.order.name,
        comment: $scope.order.comment,
        type: $scope.order.type,
        cycle: $scope.order.cycle,
        alipay: $scope.order.alipay,
        paypal: $scope.order.paypal,
        flow: $scope.order.flow,
        refTime: $scope.order.refTime,
        autoRemove: $scope.order.autoRemove,
        multiServerFlow: $scope.order.multiServerFlow,
        changeOrderType: $scope.order.changeOrderType,
        server: $scope.order.server,
      }).then(success => {
        $state.go('admin.order');
      });
    };
  }
])
.controller('AdminEditOrderController', ['$scope', '$state', '$http', '$stateParams', 'confirmDialog', '$filter',
  ($scope, $state, $http, $stateParams, confirmDialog, $filter) => {
    $scope.setTitle('编辑订单');
    $scope.setMenuButton('arrow_back', 'admin.order');

    $scope.typeList = [
      {key: '周', value: 2},
      {key: '月', value: 3},
      {key: '天', value: 4},
      {key: '小时', value: 5},
    ];

    $scope.orderId = $stateParams.id;
    $http.get('/api/admin/server').then(success => {
      $scope.servers = success.data;
    });
    $http.get(`/api/admin/order/${ $scope.orderId }`).then(success => {
      $scope.order = success.data;
      $scope.order.flowStr = $filter('flowNum2Str')($scope.order.flow);
      $scope.order.refTimeStr = $filter('timeNum2Str')($scope.order.refTime);
      $scope.orderServer = !!$scope.order.server;
      $scope.orderServerObj = {};
      if($scope.order.server) {
        $scope.servers.forEach(server => {
          if($scope.order.server.indexOf(server.id) >= 0) {
            $scope.orderServerObj[server.id] = true;
          } else {
            $scope.orderServerObj[server.id] = false;
          }
        });
      }
    });
    $scope.cancel = () => { $state.go('admin.order'); };
    $scope.delete = () => {
      confirmDialog.show({
        text: '真的要删除此订单吗？',
        cancel: '取消',
        confirm: '删除',
        error: '删除订单失败',
        useFnErrorMessage: true,
        fn: function () {
          return $http.delete(`/api/admin/order/${ $scope.orderId }`).catch(err => {
            if(err.status === 403) {
              let errData = '删除订单失败';
              if(err.data === 'account with this order exists') { errData = '无法删除订单，请先删除订单对应的账号'; }
              if(err.data === 'giftcard with this order exists') { errData = '无法删除订单，请先删除订单对应的充值码'; }
              return Promise.reject(errData);
            } else {
              return Promise.reject('网络异常，请稍后再试');
            }
          });
        },
      }).then(() => {
        $state.go('admin.order');
      });
    };
    $scope.confirm = () => {
      $scope.order.flow = $filter('flowStr2Num')($scope.order.flowStr);
      $scope.order.refTime = $filter('timeStr2Num')($scope.order.refTimeStr);
      const server = Object.keys($scope.orderServerObj)
      .map(m => {
        if($scope.orderServerObj[m]) {
          return +m;
        }
      })
      .filter(f => f);
      $scope.order.server = $scope.orderServer ? server : null;
      $http.put(`/api/admin/order/${ $scope.orderId }`, {
        name: $scope.order.name,
        comment: $scope.order.comment,
        type: $scope.order.type,
        cycle: $scope.order.cycle,
        alipay: $scope.order.alipay,
        paypal: $scope.order.paypal,
        flow: $scope.order.flow,
        refTime: $scope.order.refTime,
        autoRemove: $scope.order.autoRemove,
        multiServerFlow: $scope.order.multiServerFlow,
        changeOrderType: $scope.order.changeOrderType,
        server: $scope.order.server,
      }).then(success => {
        $state.go('admin.order');
      });
    };
  }
])
;