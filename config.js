module.exports = {
  PORT: process.env.PORT || 3000,
  REDIS_ENDPOINT: process.env.REDIS_ENDPOINT || `localhost`,
  REDIS_PORT: process.env.REDIS_PORT || 6379
};