// Metro: además de movil/, vigila ../src para importar la lógica pura compartida (src/lib/dominio/*).
// Los alias (@dominio/*, @/*, ~/*) salen de tsconfig.json (tsconfigPaths de Expo, activo por defecto).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../src")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
module.exports = config;
