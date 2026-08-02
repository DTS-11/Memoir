const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .wasm modules as binary assets
config.resolver.assetExts.push('wasm');

module.exports = config;
