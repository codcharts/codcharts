'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

// import Chart from 'chartjs' ;
// import lodash from 'lodash';
// import d3 from 'd3';

var weaponGroupNames = {
  ar: 'Assault Rifles',
  smg: 'Submachine Guns',
  lmg: 'Light Machine Guns',
  sniper: 'Sniper Rifles',
  shotgun: 'Shotguns',
  pistol: 'Pistols'
};

function load(path) {
  return new Promise(function (resolve, reject) {
    var req = new XMLHttpRequest();
    req.overrideMimeType('application/json');
    req.open('GET', path, true);
    req.onreadystatechange = function () {
      if (req.readyState == 4 && req.status == '200') {
        resolve(req.responseText);
      }
    };
    req.send(null);
  });
}

function loadJson(path) {
  return load(path).then(function (res) {
    return JSON.parse(res);
  });
}

function parseRangeUnits(units) {
  return {
    units: units,
    inches: units,
    feet: Math.ceil(units * 0.08334),
    yards: units * 0.02778,
    centimeters: units * 2.54,
    meters: Math.floor(units * 0.0254)
  };
}

function getSuppressorDamageRangeScale(weapon, rangeIndex) {
  var damageRangeScaleKeys = ['damageRangeScale1', 'damageRangeScale2', 'damageRangeScale3', 'damageRangeScale4', 'damageRangeScale5', 'damageRangeScale6'];
  if (weapon.WEAPONFILE.indexOf('ar_standard') !== -1) {
    return Number(attachmentsById.suppressed.damageRangeScale);
  }
  if (weapon.WEAPONFILE.indexOf('ar_') !== -1) {
    return Number(attachmentsById.suppressed_ar.damageRangeScale);
  }
  if (weapon.WEAPONFILE.indexOf('smg_') !== -1) {
    return Number(attachmentsById.suppressed_smg.damageRangeScale);
  }
  if (weapon.WEAPONFILE.indexOf('shotgun_precision_') !== -1) {
    return Number(attachmentsById.suppressed_shotgunprecision[damageRangeScaleKeys[rangeIndex]]);
  }
  if (weapon.WEAPONFILE.indexOf('shotgun_') !== -1) {
    return Number(attachmentsById.suppressed_shotgun.damageRangeScale);
  }
  return 1;
}

function getDamage(weapon, rangeIndex) {
  var damageKeys = ['damage', 'damage2', 'damage3', 'damage4', 'damage5', 'minDamage'];
  var multishotBaseDamageKeys = ['multishotBaseDamage1', 'multishotBaseDamage2', 'multishotBaseDamage3', 'multishotBaseDamage4', 'multishotBaseDamage5', 'multishotBaseDamage6'];
  return Number(weapon[damageKeys[rangeIndex]]) + Number(weapon[multishotBaseDamageKeys[rangeIndex]]);
}

function getRange(weapon, rangeIndex) {
  var rangeKeys = ['maxDamageRange', 'damageRange2', 'damageRange3', 'damageRange4', 'damageRange5', 'minDamageRange'];
  return Number(weapon[rangeKeys[rangeIndex]]);
}

function getStatsAtRange(weapon, attachmentsById, attachments, rangeIndex) {
  var damageScaleKeys = ['damageScale1', 'damageScale2', 'damageScale3', 'damageScale4', 'damageScale5', 'damageScale6'];

  var damage = getDamage(weapon, rangeIndex);
  var stk = Math.ceil(100 / damage);
  var range = getRange(weapon, rangeIndex);
  if (attachments.indexOf('suppressor') !== -1) {
    range = range * getSuppressorDamageRangeScale(weapon, rangeIndex);
  }
  return {
    damage: damage,
    stk: stk,
    range: parseRangeUnits(range)
  };
}

function parseWeapon(weapon, attachmentsById, attachments) {
  var rangeIndexes = [0, 1, 3, 4, 5];

  var stats = rangeIndexes.reduce(function (prev, rangeKey) {
    var stats = getStatsAtRange(weapon, attachmentsById, attachments, rangeKey);
    if (stats.stk !== Infinity) {
      if (prev.length > 0) {
        if (stats.stk === prev[prev.length - 1].stk) {
          prev.pop();
          return [].concat(_toConsumableArray(prev), [stats]);
        }
        if (stats.range.units - prev[prev.length - 1].range.units < 2) {
          return prev;
        }
      }
      return [].concat(_toConsumableArray(prev), [stats]);
    }
    return prev;
  }, []);

  return {
    name: weapon.name,
    id: weapon.WEAPONFILE,
    stats: stats,
    weapon: weapon
  };
}

var promiseAttachments = new Promise(function (resolve, reject) {
  d3.csv('data/raw_attachments.csv').get(function (error, rows) {
    if (error) {
      reject(error);
    }

    var attachmentsById = window.attachmentsById = _.keyBy(rows, 'ATTACHMENTFILE');

    resolve(attachmentsById);
  });
});

var weaponsById = {};

var promiseWeapons = function promiseWeapons(attachmentsById) {
  return new Promise(function (resolve, reject) {
    d3.csv('data/raw_weapons.csv').row(function (data) {
      data.name = data.WEAPONFILE.indexOf('dualoptic_') === 0 ? data.displayName + ' Varix' : data.displayName;
      return data;
    }).get(function (error, rows) {
      if (error) {
        reject(error);
      }

      weaponsById = window.weaponsById = _.keyBy(rows, 'WEAPONFILE');

      resolve(weaponsById);
    });
  });
};

var promiseWeaponGroups = loadJson('data/weapon_groups.json').then(function (res) {
  var weaponGroups = window.weaponGroups = res;
  weaponGroups.all = _.reduce(weaponGroups, function (prev, current) {
    return [].concat(_toConsumableArray(prev), _toConsumableArray(current));
  });
  return weaponGroups;
});

Promise.all([promiseAttachments.then(function (attachments) {
  return promiseWeapons(attachments);
}), promiseWeaponGroups]).then(function (args) {
  var weaponsById = args[0];
  var weaponGroups = args[1];

  var chartsById = void 0;
  var weapons = void 0;

  function setup() {
    document.querySelector('.loader').classList.remove('hidden');
    document.querySelector('.weapons').innerHTML = '';
    chartsById = {};
    weapons = filterWeapons(weaponsById, weaponGroups);
    draw(chartsById, weapons);
    document.querySelector('.loader').classList.add('hidden');
  }
  setup();

  document.querySelector('select#category').onchange = setup;
  document.querySelector('select#game').onchange = setup;
  document.querySelector('input#suppressor').onchange = function () {
    return draw(chartsById, weapons);
  };
});
// .catch((err) => console.error(err));

function filterWeapons(weaponsById, weaponGroups) {
  var category = document.querySelector('select#category').value;
  var game = document.querySelector('select#game').value;

  return _.filter(weaponsById, function (weapon) {
    return weapon.WEAPONFILE.indexOf(game) !== -1 && weapon.WEAPONFILE.indexOf('dualoptic_') === -1 && weapon.WEAPONFILE.indexOf('dw_') === -1 && weapon.WEAPONFILE.indexOf('lh_') === -1 && weaponGroups[category].indexOf(weapon.displayName) !== -1;
  });
}

function draw(chartsById, weapons) {
  var attachments = document.querySelector('input#suppressor').checked ? ['suppressor'] : [];

  weapons.forEach(function (weapon) {
    var weaponModel = parseWeapon(weapon, attachmentsById, attachments);
    var labels = weaponModel.stats.map(function (stat) {
      return stat.stk;
    });
    var data = weaponModel.stats.map(function (stat) {
      return stat.range.meters;
    });

    var chart = chartsById[weaponModel.id];
    if (chart) {
      chart.data.datasets[0].data = data;
      chart.update();
    } else {
      chart = drawChart(weaponModel.name, weaponModel.id, labels, data, weaponModel);
      chartsById[weaponModel.id] = chart;
    }
  });
}

function drawChart(title, weaponfile, labels, data, weaponModel) {
  var template = '\n    <div class="chart">\n      <div class="chart-header">\n        <span class="title">' + title + '</span>\n        <span class="weaponfile">' + weaponfile + '</span>\n      </div>\n      <span class="watermark">CODCharts.com</span>\n      <canvas width="250" height="250"></canvas>\n    </div>\n  ';
  var div = document.createElement('div');
  div.innerHTML = template;
  document.querySelector('.weapons').appendChild(div);
  var ctx = div.querySelector('canvas');

  var chartData = {
    labels: labels,
    datasets: [{
      label: title + ' Shots To Kill',
      backgroundColor: 'rgba(255, 102, 0, 0.8)',
      borderColor: 'rgba(255, 102, 0, 1)',
      borderWidth: 1,
      hoverBackgroundColor: 'rgba(255, 102, 0, 0.5)',
      hoverBorderColor: 'rgba(255, 102, 0, 0.6)',
      data: data,
      weaponModel: weaponModel
    }]
  };

  var options = {
    legend: {
      display: false
    },
    scales: {
      paddingLeft: 30,
      xAxes: [{
        ticks: {
          fontSize: 20,
          fontColor: 'rgba(102, 102, 102, 1)'
        },
        gridLines: {
          display: false
        }
      }],
      yAxes: [{
        scaleLabel: {
          display: false,
          labelString: 'Distance (meters)',
          fontFamily: 'sans-serif'
        },
        ticks: {
          maxTicksLimit: 5,
          max: 70,
          min: 0
        },
        gridLines: {
          color: 'rgba(52, 52, 52, 1)'
        }
      }]
    },
    tooltips: {
      // custom: function() {
      //   console.log('tooltip', arguments)
      // },
      backgroundColor: 'rgba(0,0,0,1)',
      bodyFontSize: 15,
      callbacks: {
        title: function title(tooltipItem, data) {
          console.log('arguments', arguments);
          var stk = tooltipItem[0].xLabel;
          var weaponModel = data.datasets[tooltipItem[0].datasetIndex].weaponModel;
          var stats = weaponModel.stats[tooltipItem[0].index];
          return stk + ' Hits';
        },
        beforeBody: function beforeBody(tooltipItem, data) {
          var weaponModel = data.datasets[tooltipItem[0].datasetIndex].weaponModel;
          var stats = weaponModel.stats[tooltipItem[0].index];
          console.log(weaponModel);
          return [stats.range.meters + 'm', stats.range.feet + 'ft'].join('\n');
        },
        label: function label(tooltipItem, data) {
          console.log(tooltipItem);
          var weaponModel = data.datasets[tooltipItem.datasetIndex].weaponModel;
          var stats = weaponModel.stats[tooltipItem.index];
          console.log(weaponModel);
          return [stats.damage + ' Damage'].join('\n');
        }
      }
    }
  };

  return new Chart(ctx, {
    type: 'bar',
    data: chartData,
    options: options
  });
}
