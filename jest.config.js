module.exports = {
  preset: 'jest-expo',
  // Prototype node:test suites run separately via test:prototype.
  roots: ['<rootDir>/tests', '<rootDir>/web/tests', '<rootDir>/__mocks__'],
  moduleDirectories: ['node_modules', 'node_modules/expo/node_modules'],
  // Required by react-native-gesture-handler; the Trip sheet and later drag
  // reorder both mount GestureHandlerRootView.
  setupFiles: ['<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js'],
};
