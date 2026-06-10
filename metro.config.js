const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .onnx model files and .wasm modules as binary assets
config.resolver.assetExts.push('onnx');
config.resolver.assetExts.push('wasm');

module.exports = config;
