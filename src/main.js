let debug             = require('debug')('purge-cache:server');
let api               = require('./api');
let path              = require('path');
let Promise           = require('promise');
let exchanges         = require('./exchanges');
let _                 = require('lodash');
let config            = require('typed-env-config');
let loader            = require('taskcluster-lib-loader');
let monitor           = require('taskcluster-lib-monitor');
let validate          = require('taskcluster-lib-validate');
let server            = require('taskcluster-lib-app');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => validate({
      prefix:  'purge-cache/v1/',
      aws:      cfg.aws,
    }),
  },
  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: 'purge-cache',
      credentials: cfg.taskcluster.credentials,
      mock: profile === 'test',
      process,
    }),
  },

  publisher: {
    requires: ['cfg', 'validator', 'monitor'],
    setup: ({cfg, validator, monitor}) =>
      exchanges.setup({
        credentials:        cfg.pulse,
        exchangePrefix:     cfg.purgeCache.exchangePrefix,
        validator:          validator,
        referencePrefix:    'purge-cache/v1/exchanges.json',
        publish:            process.env.NODE_ENV === 'production',
        aws:                cfg.aws,
        monitor:            monitor.prefix('publisher'),
      }),
  },

  api: {
    requires: ['cfg', 'monitor', 'validator', 'publisher'],
    setup: ({cfg, monitor, validator, publisher}) => api.setup({
      context:          {publisher},
      validator:        validator,
      publish:          process.env.NODE_ENV === 'production',
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'purge-cache/v1/api.json',
      monitor:          monitor.prefix('api'),
    }),
  },

  server: {
    requires: ['cfg', 'api'],
    setup: ({cfg, api}) => {

      debug('Launching server.');
      let app = server(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
  },
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
