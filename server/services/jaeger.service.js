const JaegerService = require('moleculer-jaeger');

module.exports = {
    name: "jaeger",
    mixins: [JaegerService],
    settings: {
        host: "jaeger-agent",
        port: 6832,

        sampler: {
            type: "Const",
            options: {
                decision: 1
            }
        }
    }
};
