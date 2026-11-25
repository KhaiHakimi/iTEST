'use strict';

const globals = require('globals');

module.exports = [
  {ignores: ['dist/', 'reports/', 'node_modules/', 'examples/']},
  ...require('gts'),
  {
    // The web UI runs in the browser, not Node.
    files: ['web/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
  },
];
