
class Session {
    find(id) {}
    save(id, data) {}
}

const SESSION_TTL = 24 * 60 * 60;

class RedisStore extends Session {

    constructor(redisClient) {
        super();
        this.client = redisClient;
    }

    find(id) {
      return new Promise((resolve, reject) => {
         this.client.hgetall(`session:${id}`, function(err, data) {
          if (err) {
            reject(err)
          }
          resolve(data)
        });
      })
      }

    save(id, { userId, username, connected, room }) {
        this.client.hmset(
            `session:${id}`,
            "userId",
            userId,
            "username",
            username,
            "connected",
            connected,
            "room",
            room
          , function(err, res) {
           return true
          });
      }

}

const mapSession = ([userID, username, connected]) =>
  userID ? { userID, username, connected: connected === "true" } : undefined;

module.exports = { RedisStore }