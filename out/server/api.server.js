"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverApiFactory = serverApiFactory;
const express_1 = __importDefault(require("express"));
const is_error_1 = __importDefault(require("is-error"));
const serialize_error_1 = require("serialize-error");
const api_base_1 = require("../shared/api.base");
const config_1 = require("./config");
const logger_1 = require("./logger");
const authcheck_1 = require("./util/authcheck");
function serverApiFactory(io, replicator, extensions, mount) {
    const apiContexts = new Set();
    /**
     * This is what enables intra-context messaging.
     * I.e., passing messages from one extension to another in the same Node.js context.
     */
    function _forwardMessageToContext(messageName, bundleName, data) {
        process.nextTick(() => {
            apiContexts.forEach((ctx) => {
                ctx._messageHandlers.forEach((handler) => {
                    if (messageName === handler.messageName &&
                        bundleName === handler.bundleName) {
                        handler.func(data);
                    }
                });
            });
        });
    }
    return class NodeCGAPIServer extends api_base_1.NodeCGAPIBase {
        static sendMessageToBundle(messageName, bundleName, data) {
            _forwardMessageToContext(messageName, bundleName, data);
            io.emit("message", {
                bundleName,
                messageName,
                content: data,
            });
        }
        static readReplicant(name, namespace) {
            if (!name || typeof name !== "string") {
                throw new Error("Must supply a name when reading a Replicant");
            }
            if (!namespace || typeof namespace !== "string") {
                throw new Error("Must supply a namespace when reading a Replicant");
            }
            const replicant = replicator.declare(name, namespace);
            return replicant.value;
        }
        static Replicant(name, namespace, opts) {
            if (!name || typeof name !== "string") {
                throw new Error("Must supply a name when reading a Replicant");
            }
            if (!namespace || typeof namespace !== "string") {
                throw new Error("Must supply a namespace when reading a Replicant");
            }
            return replicator.declare(name, namespace, opts);
        }
        get Logger() {
            return logger_1.Logger;
        }
        get log() {
            if (this._memoizedLogger) {
                return this._memoizedLogger;
            }
            this._memoizedLogger = new logger_1.Logger(this.bundleName);
            return this._memoizedLogger;
        }
        /**
         * The full NodeCG server config, including potentially sensitive keys.
         */
        get config() {
            return JSON.parse(JSON.stringify(config_1.config));
        }
        /**
         * _Extension only_<br/>
         * Creates a new express router.
         * See the [express docs](http://expressjs.com/en/api.html#express.router) for usage.
         * @function
         */
        Router = express_1.default.Router;
        util = {
            /**
             * _Extension only_<br/>
             * Checks if a session is authorized. Intended to be used in express routes.
             * @param {object} req - A HTTP request.
             * @param {object} res - A HTTP response.
             * @param {function} next - The next middleware in the control flow.
             */
            authCheck: authcheck_1.authCheck,
        };
        /**
         * _Extension only_<br/>
         * Object containing references to all other loaded extensions. To access another bundle's extension,
         * it _must_ be declared as a `bundleDependency` in your bundle's [`package.json`]{@tutorial manifest}.
         * @name NodeCG#extensions
         *
         * @example
         * // bundles/my-bundle/package.json
         * {
         *     "name": "my-bundle"
         *     ...
         *     "bundleDependencies": {
         *         "other-bundle": "^1.0.0"
         *     }
         * }
         *
         * // bundles/my-bundle/extension.js
         * module.exports = function (nodecg) {
         *     const otherBundle = nodecg.extensions['other-bundle'];
         *     // Now I can use `otherBundle`!
         * }
         */
        get extensions() {
            return extensions;
        }
        /**
         * _Extension only_<br/>
         * Mounts Express middleware to the main server Express app.
         * Middleware mounted using this method comes _after_ all the middlware that NodeCG
         * uses internally.
         * See the [Express docs](http://expressjs.com/en/api.html#app.use) for usage.
         * @function
         */
        mount = mount;
        _memoizedLogger;
        constructor(bundle) {
            super(bundle);
            apiContexts.add(this);
            io.on("connection", (socket) => {
                socket.on("message", (data, ack) => {
                    const wrappedAck = _wrapAcknowledgement(ack);
                    this._messageHandlers.forEach((handler) => {
                        if (data.messageName === handler.messageName &&
                            data.bundleName === handler.bundleName) {
                            handler.func(data.content, wrappedAck);
                        }
                    });
                });
            });
        }
        /**
         * _Extension only_<br/>
         * Gets the server Socket.IO context.
         * @function
         */
        getSocketIOServer = () => io;
        /**
         * Sends a message to a specific bundle. Also available as a static method.
         * See {@link NodeCG#sendMessage} for usage details.
         * @param {string} messageName - The name of the message.
         * @param {string} bundleName - The name of the target bundle.
         * @param {mixed} [data] - The data to send.
         * @param {function} [cb] - _Browser only_ The error-first callback to handle the server's
         * [acknowledgement](http://socket.io/docs/#sending-and-getting-data-%28acknowledgements%29) message, if any.
         * @return {Promise|undefined} - _Browser only_ A Promise that is rejected if the first argument provided to the
         * acknowledgement is an `Error`, otherwise it is resolved with the remaining arguments provided to the acknowledgement.
         * But, if a callback was provided, this return value will be `undefined`, and there will be no Promise.
         */
        sendMessageToBundle(messageName, bundleName, data) {
            this.log.trace("Sending message %s to bundle %s with data:", messageName, bundleName, data);
            return NodeCGAPIServer.sendMessageToBundle.apply(api_base_1.NodeCGAPIBase, arguments);
        }
        /**
         * Sends a message with optional data within the current bundle.
         * Messages can be sent from client to server, server to client, or client to client.
         *
         * Messages are namespaced by bundle. To send a message in another bundle's namespace,
         * use {@link NodeCG#sendMessageToBundle}.
         *
         * When a `sendMessage` is used from a client context (i.e., graphic or dashboard panel),
         * it returns a `Promise` called an "acknowledgement". Your server-side code (i.e., extension)
         * can invoke this acknowledgement with whatever data (or error) it wants. Errors sent to acknowledgements
         * from the server will be properly serialized and intact when received on the client.
         *
         * Alternatively, if you do not wish to use a `Promise`, you can provide a standard error-first
         * callback as the last argument to `sendMessage`.
         *
         * If your server-side code has multiple listenFor handlers for your message,
         * you must first check if the acknowledgement has already been handled before
         * attempting to call it. You may so do by checking the `.handled` boolean
         * property of the `ack` function passed to your listenFor handler.
         *
         * See [Socket.IO's docs](http://socket.io/docs/#sending-and-getting-data-%28acknowledgements%29)
         * for more information on how acknowledgements work under the hood.
         *
         * @param {string} messageName - The name of the message.
         * @param {mixed} [data] - The data to send.
         * @param {function} [cb] - _Browser only_ The error-first callback to handle the server's
         * [acknowledgement](http://socket.io/docs/#sending-and-getting-data-%28acknowledgements%29) message, if any.
         * @return {Promise} - _Browser only_ A Promise that is rejected if the first argument provided to the
         * acknowledgement is an `Error`, otherwise it is resolved with the remaining arguments provided to the acknowledgement.
         *
         * @example <caption>Sending a normal message:</caption>
         * nodecg.sendMessage('printMessage', 'dope.');
         *
         * @example <caption>Sending a message and replying with an acknowledgement:</caption>
         * // bundles/my-bundle/extension.js
         * module.exports = function (nodecg) {
         *     nodecg.listenFor('multiplyByTwo', (value, ack) => {
         *         if (value === 4) {
         *             ack(new Error('I don\'t like multiplying the number 4!');
         *             return;
         *         }
         *
         *         // acknowledgements should always be error-first callbacks.
         *         // If you do not wish to send an error, send "null"
         *         if (ack && !ack.handled) {
         *             ack(null, value * 2);
         *         }
         *     });
         * }
         *
         * // bundles/my-bundle/graphics/script.js
         * // Both of these examples are functionally identical.
         *
         * // Promise acknowledgement
         * nodecg.sendMessage('multiplyByTwo', 2)
         *     .then(result => {
         *         console.log(result); // Will eventually print '4'
         *     .catch(error => {
         *         console.error(error);
         *     });
         *
         * // Error-first callback acknowledgement
         * nodecg.sendMessage('multiplyByTwo', 2, (error, result) => {
         *     if (error) {
         *         console.error(error);
         *         return;
         *     }
         *
         *     console.log(result); // Will eventually print '4'
         * });
         */
        sendMessage(messageName, data) {
            this.sendMessageToBundle(messageName, this.bundleName, data);
        }
        /**
         * Reads the value of a replicant once, and doesn't create a subscription to it. Also available as a static method.
         * @param {string} name - The name of the replicant.
         * @param {string} [bundle=CURR_BNDL] - The bundle namespace to in which to look for this replicant.
         * @param {function} cb - _Browser only_ The callback that handles the server's response which contains the value.
         * @example <caption>From an extension:</caption>
         * // Extensions have immediate access to the database of Replicants.
         * // For this reason, they can use readReplicant synchronously, without a callback.
         * module.exports = function (nodecg) {
         *     var myVal = nodecg.readReplicant('myVar', 'some-bundle');
         * }
         * @example <caption>From a graphic or dashboard panel:</caption>
         * // Graphics and dashboard panels must query the server to retrieve the value,
         * // and therefore must provide a callback.
         * nodecg.readReplicant('myRep', 'some-bundle', value => {
         *     // I can use 'value' now!
         *     console.log('myRep has the value '+ value +'!');
         * });
         */
        readReplicant(name, param2) {
            let { bundleName } = this;
            if (typeof param2 === "string") {
                bundleName = param2;
            }
            else if (typeof param2 === "object" && bundleName in param2) {
                bundleName = param2.name;
            }
            return this.constructor.readReplicant(name, bundleName);
        }
        _replicantFactory = (name, namespace, opts) => replicator.declare(name, namespace, opts);
    };
}
/**
 * By default, Errors get serialized to empty objects when run through JSON.stringify.
 * This function wraps an "acknowledgement" callback and checks if the first argument
 * is an Error. If it is, that Error is serialized _before_ being sent off to Socket.IO
 * for serialization to be sent across the wire.
 * @param ack {Function}
 * @private
 * @ignore
 * @returns {Function}
 */
function _wrapAcknowledgement(ack) {
    let handled = false;
    const wrappedAck = function (firstArg, ...restArgs) {
        if (handled) {
            throw new Error("Acknowledgement already handled");
        }
        handled = true;
        if ((0, is_error_1.default)(firstArg)) {
            firstArg = (0, serialize_error_1.serializeError)(firstArg);
        }
        ack(firstArg, ...restArgs);
    };
    Object.defineProperty(wrappedAck, "handled", {
        get() {
            return handled;
        },
    });
    return wrappedAck;
}
//# sourceMappingURL=api.server.js.map