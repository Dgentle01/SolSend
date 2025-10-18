const path = require('path');
const webpack = require('webpack');

module.exports = function override(config, env) {
  // Production optimizations
  if (env === 'production') {
    // Bundle splitting
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 20
        },
        solana: {
          test: /[\\/]node_modules[\\/]@solana[\\/]/,
          name: 'solana',
          chunks: 'all',
          priority: 30
        },
        radix: {
          test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
          name: 'radix',
          chunks: 'all',
          priority: 25
        }
      }
    };

    // Tree shaking optimization
    config.optimization.usedExports = true;
    config.optimization.sideEffects = false;

    // Minimize bundle size
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
      // Optimize lodash imports
      'lodash': 'lodash-es'
    };
  }

  return config;
};
