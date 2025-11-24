/**
 * Babel 설정 파일
 * Jest에서 ES6+ 문법을 사용하기 위한 설정
 */

module.exports = {
    presets: [
        ['@babel/preset-env', {
            targets: {
                node: 'current'
            }
        }]
    ]
};

