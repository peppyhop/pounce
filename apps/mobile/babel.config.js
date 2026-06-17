module.exports = function (api) {
  api.cache(true);
  return {
    // Uniwind needs no Babel plugin (build-time Metro transform).
    // babel-preset-expo (SDK 54+) auto-injects the Reanimated 4 / worklets plugin.
    presets: ["babel-preset-expo"],
  };
};
