/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src/tests'],
    testMatch: ['**/*.test.js'],
    collectCoverageFrom: [
        'src/services/**/*.js',
        '!**/node_modules/**',
    ],
    coverageDirectory: 'coverage',
    clearMocks: true,
};
