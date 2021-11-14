
class Session {
    insertUser(id, data) { }
    removeUser(id) { }
}

class SessionStore extends Session {

    constructor(redisClient) {
        super();
        this.client = redisClient;
    }

    insertUser = function (id, data) {
        this.client.hset('User', id, JSON.stringify({ data, ins_ts: Date.now() }),
            function (err) {
                if (err) {
                    console.error(err);
                }
            }
        );
    };


    removeUser = function (id) {
        this.client.hdel('User', id,
            function (err) {
                if (err) {
                    console.error(err);
                }
            }
        );
    };
}

module.exports = { SessionStore }