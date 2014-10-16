/*
 * Vibe v3.0.0-Alpha2
 * http://vibe-project.github.io/projects/vibe-javascript-client/
 * 
 * Copyright 2014 The Vibe Project 
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// Implement the Universal Module Definition (UMD) pattern 
// see https://github.com/umdjs/umd/blob/master/returnExports.js
(function(root, factory) {
    if (typeof define === "function" && define.amd) {
        // AMD
        define([], function() {
            return factory(root);
        });
    } else if (typeof exports === "object") {
        // Node
        // prepare the window object
        var window = require("jsdom").jsdom().parentWindow;
        window.WebSocket = require("ws");
        window.EventSource = require("eventsource");
        module.exports = factory(window);
        // node-XMLHttpRequest 1.x conforms XMLHttpRequest Level 1 but can perform a cross-domain request
        module.exports.util.corsable = true;
    } else {
        // Browser globals, Window
        root.vibe = factory(root);
    }
}(this, function(window) {
    
    // Enables ECMAScript 5's strict mode
    "use strict";
    
    // A global identifier
    var guid = 1;
    // Is the unload event being processed?
    var unloading;
    // Prototype shortcuts
    var slice = Array.prototype.slice;
    var toString = Object.prototype.toString;
    var hasOwn = Object.prototype.hasOwnProperty;
    // Variables for Node
    var document = window.document;
    var location = window.location;
    var navigator = window.navigator;
    // Utility functions
    var util;
    // Callback names for JSONP
    var jsonpCallbacks = [];
    var head = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
    
    // Most are inspired by jQuery
    util = {
        now: Date.now || function() {
            return +(new Date());
        },
        isArray: Array.isArray || function(array) {
            return toString.call(array) === "[object Array]";
        },
        isFunction: function(fn) {
            return toString.call(fn) === "[object Function]";
        },
        makeAbsolute: function(url) {
            var div = document.createElement("div");
            // Uses an innerHTML property to obtain an absolute URL
            div.innerHTML = '<a href="' + url + '"/>';
            // encodeURI and decodeURI are needed to normalize URL between Internet Explorer and non-Internet Explorer,
            // since Internet Explorer doesn't encode the href property value and return it - http://jsfiddle.net/Yq9M8/1/
            return encodeURI(decodeURI(div.firstChild.href));
        },
        on: function(elem, type, fn) {
            if (elem.addEventListener) {
                elem.addEventListener(type, fn, false);
            } else if (elem.attachEvent) {
                elem.attachEvent("on" + type, fn);
            }
        },
        off: function(elem, type, fn) {
            if (elem.removeEventListener) {
                elem.removeEventListener(type, fn, false);
            } else if (elem.detachEvent) {
                elem.detachEvent("on" + type, fn);
            }
        },
        url: function(url, params) {
            var name;
            var s = [];
            params = params || {};
            params._ = guid++;
            // params is supposed to be one-depth object
            for (name in params) {
                s.push(encodeURIComponent(name) + "=" + encodeURIComponent(params[name]));
            }
            return url + (/\?/.test(url) ? "&" : "?") + s.join("&").replace(/%20/g, "+");
        },
        xhr: function() {
            try {
                return new window.XMLHttpRequest();
            } catch (e1) {
                try {
                    return new window.ActiveXObject("Microsoft.XMLHTTP");
                } catch (e2) {}
            }
        },
        parseJSON: window.JSON ? window.JSON.parse : function(data) {
            return Function("return " + data)();
        },
        // http://github.com/flowersinthesand/stringifyJSON
        stringifyJSON: window.JSON ? window.JSON.stringify : function(value) {
            var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
                meta = {
                    '\b': '\\b',
                    '\t': '\\t',
                    '\n': '\\n',
                    '\f': '\\f',
                    '\r': '\\r',
                    '"': '\\"',
                    '\\': '\\\\'
                };
            
            function quote(string) {
                return '"' + string.replace(escapable, function(a) {
                    var c = meta[a];
                    return typeof c === "string" ? c : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
                }) + '"';
            }
            
            function f(n) {
                return n < 10 ? "0" + n : n;
            }
            
            return (function str(key, holder) {
                    var i, v, len, partial, value = holder[key], type = typeof value;
                            
                    if (value && typeof value === "object" && typeof value.toJSON === "function") {
                        value = value.toJSON(key);
                        type = typeof value;
                    }
                    
                    switch (type) {
                    case "string":
                        return quote(value);
                    case "number":
                        return isFinite(value) ? String(value) : "null";
                    case "boolean":
                        return String(value);
                    case "object":
                        if (!value) {
                            return "null";
                        }
                        
                        switch (toString.call(value)) {
                        case "[object Date]":
                            return isFinite(value.valueOf()) ?
                                '"' + value.getUTCFullYear() + "-" + f(value.getUTCMonth() + 1) + "-" + f(value.getUTCDate()) +
                                "T" + f(value.getUTCHours()) + ":" + f(value.getUTCMinutes()) + ":" + f(value.getUTCSeconds()) + "Z" + '"' :
                                "null";
                        case "[object Array]":
                            len = value.length;
                            partial = [];
                            for (i = 0; i < len; i++) {
                                partial.push(str(i, value) || "null");
                            }
                            
                            return "[" + partial.join(",") + "]";
                        default:
                            partial = [];
                            for (i in value) {
                                if (hasOwn.call(value, i)) {
                                    v = str(i, value);
                                    if (v) {
                                        partial.push(quote(i) + ":" + v);
                                    }
                                }
                            }
                            
                            return "{" + partial.join(",") + "}";
                        }
                    }
                })("", {"": value});
        }
    };
    // CORS able
    util.corsable = "withCredentials" in util.xhr();
    // Browser sniffing
    util.browser = (function() {
        var ua = navigator.userAgent.toLowerCase();
        var browser = {};
        var match =
            // IE 6-10
            /(msie) ([\w.]+)/.exec(ua) ||
            // IE 11+
            /(trident)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
            // Opera
            /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) || 
            // Safari
            ua.indexOf("android") < 0 && /version\/(.+) (safari)/.exec(ua) || [];
        
        browser[match[1] || ""] = true;
        browser.version = match[2] || "0";
        browser.vmajor = browser.version.split(".")[0];
        // Trident is the layout engine of the Internet Explorer
        if (browser.trident) {
            browser.msie = true;
        }
        return browser;
    })();
    
    // Callbacks object
    // inspired by jQuery.Callbacks
    function Callbacks(deferred) {
        var locked;
        var memory;
        var firing;
        var firingStart;
        var firingLength;
        var firingIndex;
        var list = [];
        var fire = function(context, args) {
            args = args || [];
            memory = !deferred || [context, args];
            firing = true;
            firingIndex = firingStart || 0;
            firingStart = 0;
            firingLength = list.length;
            for (; firingIndex < firingLength && !locked; firingIndex++) {
                list[firingIndex].apply(context, args);
            }
            firing = false;
        };
        var self = {
            add: function(fn) {
                var length = list.length;
                
                list.push(fn);
                if (firing) {
                    firingLength = list.length;
                } else if (!locked && memory && memory !== true) {
                    firingStart = length;
                    fire(memory[0], memory[1]);
                }
            },
            remove: function(fn) {
                var i;
                
                for (i = 0; i < list.length; i++) {
                    if (fn === list[i] || (fn.guid && fn.guid === list[i].guid)) {
                        if (firing) {
                            if (i <= firingLength) {
                                firingLength--;
                                if (i <= firingIndex) {
                                    firingIndex--;
                                }
                            }
                        }
                        list.splice(i--, 1);
                    }
                }
            },
            fire: function(context, args) {
                if (!locked && !firing && !(deferred && memory)) {
                    fire(context, args);
                }
            },
            lock: function() {
                locked = true;
            },
            locked: function() {
                return !!locked;
            },
            unlock: function() {
                locked = memory = firing = firingStart = firingLength = firingIndex = undefined;
            }
        };
        
        return self;
    }
    
    // Socket object
    function Socket(url, options) {
        // Makes url absolute to normalize URL
        url = util.makeAbsolute(url);
        
        // Options
        var i;
        // URI parts
        var parts = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/.exec(url.toLowerCase());
        // Default options
        var defaults = {
            reconnect: function(lastDelay) {
                return 2 * (lastDelay || 250);
            },
            sharing: false,
            timeout: false,
            transports: null,
            xdrURL: null
        };
        
        // Overrides defaults
        if (options) {
            for (i in options) {
                defaults[i] = options[i];
            }
        }
        options = defaults;
        
        // Strictly speaking, the following values are not option
        // but assigns them to options for convenience of transport
        options.url = url;
        options.crossOrigin = !!(parts && (
            // protocol 
            parts[1] != location.protocol ||
            // hostname
            parts[2] != location.hostname ||
            // port
            (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (location.port || (location.protocol === "http:" ? 80 : 443))
        ));

        // Socket
        var self = {};
        
        // Events
        var events = {};
        // Adds event handler
        self.on = function(type, fn) {
            var event;
            // For custom event
            event = events[type];
            if (!event) {
                if (events.message.locked()) {
                    return this;
                }
                event = events[type] = Callbacks();
                event.order = events.message.order;
            }
            event.add(fn);
            return this;
        };
        // Removes event handler
        self.off = function(type, fn) {
            var event = events[type];
            if (event) {
                event.remove(fn);
            }
            return this;
        };
        // Adds one time event handler
        self.once = function(type, fn) {
            function proxy() {
                self.off(type, proxy);
                fn.apply(self, arguments);
            }
            
            fn.guid = fn.guid || guid++;
            proxy.guid = fn.guid;
            return self.on(type, proxy);
        };
        // Fires event handlers
        self.fire = function(type) {
            var event = events[type];
            if (event) {
                event.fire(self, slice.call(arguments, 1));
            }
            return this;
        };
        
        // State
        var state;
        self.state = function() {
            return state;
        };
        // Each event represents a possible state of this socket
        // they are considered as special event and works in a different way
        for (i in {connecting: 1, open: 1, close: 1, waiting: 1}) {
            // This event fires only one time and handlers being added after fire are fired immediately
            events[i] = Callbacks(true);
            // State transition order
            events[i].order = guid++;
        }
        // However all the other event including message event work as you expected
        // it fires many times and handlers are executed whenever it fires
        events.message = Callbacks(false);
        // It shares the same order with the open event because it can be fired when a socket is in the opened state
        events.message.order = events.open.order;
        // State transition
        self.on("connecting", function() {
            // From preparing state
            state = "connecting";
            
            var timeoutTimer;
            function clearTimeoutTimer() {
                clearTimeout(timeoutTimer);
            }
            
            // Sets a timeout timer and clear it on open or close event
            if (options.timeout > 0) {
                timeoutTimer = setTimeout(function() {
                    self.fire("close", "timeout");
                    transport.close();
                }, options.timeout);
                self.once("open", clearTimeoutTimer).once("close", clearTimeoutTimer);
            }
            
            // TODO review
            function share() {
                var traceTimer;
                var server;
                var name = "socket-" + url;
                var servers = {
                    // Powered by the storage event and the localStorage
                    // http://www.w3.org/TR/webstorage/#event-storage
                    storage: function() {
                        var storage = window.localStorage;
                        // The storage event of Internet Explorer works strangely
                        // TODO test Internet Explorer 11
                        if (util.browser.msie) {
                            return;
                        }
                        return {
                            init: function() {
                                function onstorage(event) {
                                    // When a deletion, newValue initialized to null
                                    if (event.key === name && event.newValue) {
                                        listener(event.newValue);
                                    }
                                }
                                // Handles the storage event
                                util.on(window, "storage", onstorage);
                                self.once("close", function() {
                                    util.off(window, "storage", onstorage);
                                    // Defers again to clean the storage
                                    self.once("close", function() {
                                        storage.removeItem(name);
                                        storage.removeItem(name + "-opened");
                                        storage.removeItem(name + "-children");
                                    });
                                });
                            },
                            broadcast: function(obj) {
                                var string = util.stringifyJSON(obj);
                                storage.setItem(name, string);
                                setTimeout(function() {
                                    listener(string);
                                }, 50);
                            },
                            get: function(key) {
                                return util.parseJSON(storage.getItem(name + "-" + key));
                            },
                            set: function(key, value) {
                                storage.setItem(name + "-" + key, util.stringifyJSON(value));
                            }
                        };
                    },
                    // Powered by the window.open method
                    // https://developer.mozilla.org/en/DOM/window.open
                    windowref: function() {
                        // Internet Explorer raises an invalid argument error
                        // when calling the window.open method with the name containing non-word characters
                        var neim = name.replace(/\W/g, "");
                        var container = document.getElementById(neim);
                        var win;
                        if (!container) {
                            container = document.createElement("div");
                            container.id = neim;
                            container.style.display = "none";
                            container.innerHTML = '<iframe name="' + neim + '" />';
                            document.body.appendChild(container);
                        }
                        win = container.firstChild.contentWindow;
                        return {
                            init: function() {
                                // Callbacks from different windows
                                win.callbacks = [listener];
                                // In Internet Explorer 8 and less, only string argument can be safely passed to the function in other window
                                win.fire = function(string) {
                                    var i;
                                    for (i = 0; i < win.callbacks.length; i++) {
                                        win.callbacks[i](string);
                                    }
                                };
                            },
                            broadcast: function(obj) {
                                if (!win.closed && win.fire) {
                                    win.fire(util.stringifyJSON(obj));
                                }
                            },
                            get: function(key) {
                                return !win.closed ? win[key] : null;
                            },
                            set: function(key, value) {
                                if (!win.closed) {
                                    win[key] = value;
                                }
                            }
                        };
                    }
                };
                
                // Receives send and close command from the children
                function listener(string) {
                    var data;
                    var command = util.parseJSON(string);
                    if (command.target === "p") {
                        switch (command.type) {
                        case "send":
                            data = util.parseJSON(command.data);
                            self.send(data.type, data.data);
                            break;
                        case "close":
                            self.close();
                            break;
                        }
                    }
                }
                
                function propagateMessageEvent(args) {
                    server.broadcast({target: "c", type: "message", data: args});
                }
                
                function leaveTrace() {
                    document.cookie = encodeURIComponent(name) + "=" +
                        encodeURIComponent(util.stringifyJSON({ts: util.now(), heir: (server.get("children") || [])[0]})) +
                        "; path=/";
                }
                
                // Chooses a server
                server = servers.storage() || servers.windowref();
                server.init();
                // List of children sockets
                server.set("children", []);
                // Flag indicating the parent socket is opened
                server.set("opened", false);
                // Leaves traces
                leaveTrace();
                traceTimer = setInterval(leaveTrace, 1000);
                self.on("_message", propagateMessageEvent)
                .once("open", function() {
                    server.set("opened", true);
                    server.broadcast({target: "c", type: "open"});
                })
                .once("close", function(reason) {
                    // Clears trace timer
                    clearInterval(traceTimer);
                    // Removes the trace
                    document.cookie = encodeURIComponent(name) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
                    // The heir is the parent unless unloading
                    server.broadcast({target: "c", type: "close", data: {reason: reason, heir: !unloading ? options.id : (server.get("children") || [])[0]}});
                    self.off("_message", propagateMessageEvent);
                });
            }
            
            // Makes connection sharable  
            if (options.sharing && !isSessionTransport) {
                share();
            }
        })
        .on("open", function() {
            // From connecting state
            state = "opened";
            
            var heartbeatTimer;
            function setHeartbeatTimer() {
                // heartbeat event will be sent after options.heartbeat - options._heartbeat ms
                heartbeatTimer = setTimeout(function() {
                    self.send("heartbeat").once("heartbeat", function() {
                        clearTimeout(heartbeatTimer);
                        setHeartbeatTimer();
                    });
                    // transport will be closed after options._heartbeat ms
                    // unless the server responds it
                    heartbeatTimer = setTimeout(function() {
                        self.fire("close", "error");
                        transport.close();
                    }, options._heartbeat);
                }, options.heartbeat - options._heartbeat);
            }
            
            // Sets a heartbeat timer and clears it on close event
            if (options.heartbeat > options._heartbeat) {
                setHeartbeatTimer();
                self.once("close", function() {
                    clearTimeout(heartbeatTimer);
                });
            }
            // Locks the connecting event
            events.connecting.lock();
            // Initializes variables related with reconnection
            reconnectTimer = reconnectDelay = reconnectTry = null;
        })
        .on("close", function() {
            // From preparing, connecting or opened state
            state = "closed";
            
            var type;
            var event;
            var order = events.close.order;
            
            // Locks event whose order is lower than close event
            for (type in events) {
                event = events[type];
                if (event.order < order) {
                    event.lock();
                }
            }
            // Schedules reconnection
            if (options.reconnect) {
                // By adding a handler by one method in event handling
                // it will be the last one of close event handlers having been added 
                self.once("close", function() {
                    reconnectTry = reconnectTry || 1;
                    reconnectDelay = options.reconnect.call(self, reconnectDelay, reconnectTry);
                    if (reconnectDelay !== false) {
                        reconnectTimer = setTimeout(function() {
                            self.open();
                        }, reconnectDelay);
                        self.fire("waiting", reconnectDelay, reconnectTry);
                    }
                });
            }
        })
        .on("waiting", function() {
            // From closed state
            state = "waiting";
        });
        
        // Networking
        // Transport
        var transport;
        var isSessionTransport;
        // Reconnection
        var reconnectTimer;
        var reconnectDelay;
        var reconnectTry;        
        // Establishes a connection
        self.open = function() {
            var type;
            
            // Cancels the scheduled connection
            clearTimeout(reconnectTimer);
            // Resets event helpers
            for (type in events) {
                events[type].unlock();
            }
            // Chooses transport
            transport = isSessionTransport = null;
            // From null or waiting state
            state = "preparing";
            // Increases the number of reconnection attempts
            if (reconnectTry) {
                reconnectTry++;
            }
            
            // Starts handshaking to negotiate the protocol
            (function(done, fail) {
                var url = util.url(options.url, {when: "handshake"});
                if (!options.crossOrigin || util.corsable) {
                    var xhr = util.xhr();
                    xhr.onreadystatechange = function() {
                        // Avoids c00c023f error on Internet Explorer 9
                        if (xhr.readyState === 4) {
                            if (xhr.status === 200) {
                                done(util.parseJSON(xhr.responseText));
                            } else {
                                fail();
                            }
                        }
                    };
                    xhr.open("GET", url);
                    if (util.corsable) {
                        xhr.withCredentials = true;
                    }
                    xhr.send(null);
                } else {
                    // If a given url is cross origin and a browser doesn't implement CORS, use JSONP
                    var callback = jsonpCallbacks.pop() || ("socket_" + (guid++));
                    // Attaches callback
                    window[callback] = function(data) {
                        done(util.parseJSON(data));
                        // To prevent memory leak in some browsers, assign null and return callback name
                        window[callback] = null;
                        jsonpCallbacks.push(callback);
                    };
                    var script = document.createElement("script");
                    script.async = true;
                    script.src = url + "&callback=" + callback;
                    script.onload = script.onreadystatechange = function() {
                        if (!script.readyState || /loaded|complete/.test(script.readyState)) {
                            script.onload = script.onreadystatechange = null;
                            if (script.parentNode) {
                                script.parentNode.removeChild(script);
                            }
                        }
                    };
                    head.insertBefore(script, head.firstChild);
                }
            })(function(result) {
                // Assign a newly issued identifier for this socket
                options.id = result.id;
                // An heartbeat option can't be set by user
                options.heartbeat = result.heartbeat;
                // A user's transports is prioritized over that of server
                if (!options.transports) {
                    options.transports = result.transports;
                }
                // To speed up heartbeat test
                if (result._heartbeat) {
                    options._heartbeat = result._heartbeat;
                }
                
                // Use transports a user set if it exists
                var candidates = slice.call(options.transports);
                // Check if possible to make use of a shared socket
                if (options.sharing) {
                    candidates.unshift("session");
                }
                while (!transport && candidates.length) {
                    type = candidates.shift();
                    switch (type) {
                    case "stream":
                        candidates.unshift("sse", "streamxhr", "streamxdr", "streamiframe");
                        break;
                    case "longpoll":
                        candidates.unshift("longpollajax", "longpollxdr", "longpolljsonp");
                        break;
                    default:
                        // A transport instance will be null if it can't run on this environment
                        transport = transports[type](self, options);
                        break;
                    }
                }
                // Fires the connecting event and connects
                if (transport) {
                    options.transport = type;
                    isSessionTransport = type === "session";
                    self.fire("connecting");
                    transport.open();
                } else {
                    self.fire("close", "notransport");
                }
            }, function() {
                self.fire("close", "error");
            });
            return this;
        };
        // Disconnects the connection
        self.close = function() {
            // Prevents reconnection
            options.reconnect = false;
            clearTimeout(reconnectTimer);
            // Fires the close event immediately
            // unloading variable prevents those who use this connection from being aborted
            self.fire("close", unloading ? "error" : "aborted");
            // Delegates to the transport
            if (transport) {
                transport.close();
            }
            return this;
        };
        
        // Messaging
        // A map for reply callback
        var callbacks = {};
        // Sends an event to the server via the connection
        self.send = function(type, data, onResolved, onRejected) {
            if (state !== "opened") {
                throw new Error("A socket is not open yet");
            }
            
            // Outbound event
            var event = {id: guid++, type: type, data: data, reply: !!(onResolved || onRejected)};
            if (event.reply) {
                callbacks[event.id] = [onResolved, onRejected];
            }
            // Delegates to the transport
            transport.send(util.stringifyJSON(event));
            return this;
        };
        // For internal use only
        // receives an event from the server via the connection
        self.receive = function(data) {
            var latch;
            // Inbound event
            var event = util.parseJSON(data); 
            var args = [event.type, event.data, !event.reply ? null : {
                resolve: function(value) {
                    if (!latch) {
                        latch = true;
                        self.send("reply", {id: event.id, data: value, exception: false});
                    }
                },
                reject: function(reason) {
                    if (!latch) {
                        latch = true;
                        self.send("reply", {id: event.id, data: reason, exception: true});
                    }
                }
            }];
            
            return self.fire.apply(self, args)
            // _message event for shared sockets
            .fire("_message", args);
        };
        self.on("reply", function(reply) {
            // callbacks[reply.id] is [onResolved, onRejected]
            // FYI +false and +true is 0 and 1, respectively
            callbacks[reply.id][+reply.exception].call(self, reply.data);
            delete callbacks[reply.id];
        });
        
        return self.open();
    }

    // A group of transport object
    var transports = {
        // Session socket for connection sharing
        // TODO review
        session: function(socket, options) {
            var trace;
            var orphan;
            var connector;
            var name = "socket-" + options.url;
            var connectors = {
                storage: function() {
                    // The storage event of Internet Explorer works strangely
                    // TODO test Internet Explorer 11
                    if (util.browser.msie) {
                        return;
                    }
                    
                    var storage = window.localStorage;
                    var get = function(key) {
                        return util.parseJSON(storage.getItem(name + "-" + key));
                    };
                    var set = function(key, value) {
                        storage.setItem(name + "-" + key, util.stringifyJSON(value));
                    };
                    return {
                        init: function() {
                            function onstorage(event) {
                                if (event.key === name && event.newValue) {
                                    listener(event.newValue);
                                }
                            }
                            
                            set("children", get("children").concat([options.id]));
                            util.on(window, "storage", onstorage);
                            socket.once("close", function() {
                                var children = get("children");
                                util.off(window, "storage", onstorage);
                                if (children) {
                                    if (removeFromArray(children, options.id)) {
                                        set("children", children);
                                    }
                                }
                            });
                            return get("opened");
                        },
                        broadcast: function(obj) {
                            var string = util.stringifyJSON(obj);
                            storage.setItem(name, string);
                            setTimeout(function() {
                                listener(string);
                            }, 50);
                        }
                    };
                },
                windowref: function() {
                    var win = window.open("", name.replace(/\W/g, ""));
                    if (!win || win.closed || !win.callbacks) {
                        return;
                    }
                    return {
                        init: function() {
                            win.callbacks.push(listener);
                            win.children.push(options.id);
                            socket.once("close", function() {
                                // Removes traces only if the parent is alive
                                if (!orphan) {
                                    removeFromArray(win.callbacks, listener);
                                    removeFromArray(win.children, options.id);
                                }
                            });
                            return win.opened;
                        },
                        broadcast: function(obj) {
                            if (!win.closed && win.fire) {
                                win.fire(util.stringifyJSON(obj));
                            }
                        }
                    };
                }
            };
            
            function removeFromArray(array, val) {
                var i, length = array.length;
                for (i = 0; i < length; i++) {
                    if (array[i] === val) {
                        array.splice(i, 1);
                    }
                }
                return length !== array.length;
            }
            
            // Receives open, close and message command from the parent
            function listener(string) {
                var command = util.parseJSON(string), data = command.data;
                
                if (command.target === "c") {
                    switch (command.type) {
                    case "open":
                        socket.fire("open");
                        break;
                    case "close":
                        if (!orphan) {
                            orphan = true;
                            if (data.reason === "aborted") {
                                socket.close();
                            } else {
                                // Gives the heir some time to reconnect
                                if (data.heir === options.id) {
                                    socket.fire("close", data.reason);
                                } else {
                                    setTimeout(function() {
                                        socket.fire("close", data.reason);
                                    }, 100);
                                }
                            }
                        }
                        break;
                    case "message":
                        // When using the session transport, message events could be sent before the open event
                        if (socket.state() === "connecting") {
                            socket.once("open", function() {
                                socket.fire.apply(socket, data);
                            });
                        } else {
                            socket.fire.apply(socket, data);
                        }
                        break;
                    }
                }
            }
            
            function findTrace() {
                var matcher = new RegExp("(?:^|; )(" + encodeURIComponent(name) + ")=([^;]*)").exec(document.cookie);
                if (matcher) {
                    return util.parseJSON(decodeURIComponent(matcher[2]));
                }
            }
            
            // Finds and validates the parent socket's trace from the cookie
            trace = findTrace();
            if (!trace || util.now() - trace.ts > 1000) {
                return;
            }
            
            // Chooses a connector
            connector = connectors.storage() || connectors.windowref();
            if (!connector) {
                return;
            }
            
            return {
                open: function() {
                    var traceTimer;
                    var parentOpened;
                    var timeout = options.timeout;
                    var heartbeat = options.heartbeat;
                    
                    // Prevents side effects
                    options.timeout = options.heartbeat = false;
                    // Checks the shared one is alive
                    traceTimer = setInterval(function() {
                        var oldTrace = trace;
                        trace = findTrace();
                        if (!trace || oldTrace.ts === trace.ts) {
                            // Simulates a close signal
                            listener(util.stringifyJSON({target: "c", type: "close", data: {reason: "error", heir: oldTrace.heir}}));
                        }
                    }, 1000);
                    // Restores options
                    socket.once("close", function() {
                        clearInterval(traceTimer);
                        options.timeout = timeout;
                        options.heartbeat = heartbeat;
                    });
                    parentOpened = connector.init();
                    if (parentOpened) {
                        // Gives the user the opportunity to bind connecting event handlers
                        setTimeout(function() {
                            socket.fire("open");
                        }, 50);
                    }
                },
                send: function(event) {
                    connector.broadcast({target: "p", type: "send", data: event});
                },
                close: function() {
                    // Do not signal the parent if this method is executed by the unload event handler
                    if (!unloading) {
                        connector.broadcast({target: "p", type: "close"});
                    }
                }
            };
        },
        // Base
        base: function(socket, options) {
            var self = {};
            self.uri = {
                open: function() {
                    return util.url(options.url, {id: options.id, when: "open", transport: options.transport});
                }
            };
            self.close = function() {
                // Aborts the real connection
                self.abort();
                // Sends the abort request to the server
                // this request is supposed to run in unloading event so script tag should be used
                var script = document.createElement("script");
                script.async = false;
                script.src = util.url(options.url, {id: options.id, when: "abort"});
                script.onload = script.onreadystatechange = function() {
                    if (!script.readyState || /loaded|complete/.test(script.readyState)) {
                        script.onload = script.onreadystatechange = null;
                        if (script.parentNode) {
                            script.parentNode.removeChild(script);
                        }
                    }
                };
                head.insertBefore(script, head.firstChild);
            };
            return self;
        },
        // WebSocket
        ws: function(socket, options) {
            var ws;
            var WebSocket = window.WebSocket;
            var self = transports.base(socket, options);
            
            if (!WebSocket) {
                return;
            }
            
            self.open = function() {
                // Changes options.url's protocol part to ws or wss
                // options.url is absolute path
                var url = self.uri.open().replace(/^http/, "ws");                
                ws = new WebSocket(url);
                ws.onopen = function() {
                    socket.fire("open");
                };
                ws.onmessage = function(event) {
                    socket.receive(event.data);
                };
                ws.onerror = function() {
                    socket.fire("close", "error");
                };
                ws.onclose = function(event) {
                    socket.fire("close", event.wasClean ? "done" : "error");
                };
            };
            self.send = function(data) {
                ws.send(data);
            };
            self.abort = function() {
                ws.close();
            };
            return self;
        },
        // HTTP Base
        httpbase: function(socket, options) {
            var self = transports.base(socket, options);
            
            self.send = !options.crossOrigin || util.corsable ?
            // By XMLHttpRequest
            function(data) {
                var xhr = util.xhr();
                xhr.open("POST", util.url(options.url, {id: options.id}));
                xhr.setRequestHeader("content-type", "text/plain; charset=UTF-8");
                if (util.corsable) {
                    xhr.withCredentials = true;
                }
                xhr.send("data=" + data);
            } : window.XDomainRequest && options.xdrURL ?
            // By XDomainRequest
            function(data) {
                // Only text/plain is supported for the request's Content-Type header
                // from the fourth at http://blogs.msdn.com/b/ieinternals/archive/2010/05/13/xdomainrequest-restrictions-limitations-and-workarounds.aspx
                var xdr = new window.XDomainRequest();
                xdr.open("POST", options.xdrURL.call(socket, util.url(options.url, {id: options.id})));
                xdr.send("data=" + data);
            } :
            // By HTMLFormElement
            function(data) {
                var iframe;
                var textarea;
                var form = document.createElement("form");
                form.action = util.url(options.url, {id: options.id});
                form.target = "socket-" + (guid++);
                form.method = "POST";
                // Internet Explorer 6 needs encoding property
                form.enctype = form.encoding = "text/plain";
                form.acceptCharset = "UTF-8";
                form.style.display = "none";
                form.innerHTML = '<textarea name="data"></textarea><iframe name="' + form.target + '"></iframe>';
                textarea = form.firstChild;
                textarea.value = data;
                iframe = form.lastChild;
                util.on(iframe, "load", function() {
                    document.body.removeChild(form);
                });
                document.body.appendChild(form);
                form.submit();
            };
            return self;
        },
        // Streaming - Server-Sent Events
        sse: function(socket, options) {
            var es;
            var EventSource = window.EventSource;
            var self = transports.httpbase(socket, options);
            
            if (!EventSource || (options.crossOrigin && util.browser.safari && util.browser.vmajor < 7)) {
                return;
            }
            
            self.open = function() {
                var url = self.uri.open();                
                es = new EventSource(url, {withCredentials: true});
                es.onopen = function() {
                    socket.fire("open");
                };
                es.onmessage = function(event) {
                    socket.receive(event.data);
                };
                es.onerror = function() {
                    es.close();
                    // There is no way to find whether this connection closed normally or not
                    socket.fire("close", "done");
                };
            };
            self.abort = function() {
                es.close();
            };
            return self;
        },
        // Streaming Base
        streambase: function(socket, options) {
            var buffer = "";
            var self = transports.httpbase(socket, options);
            
            // The detail about parsing is explained in the reference implementation
            self.parse = function(chunk) {
                // Strips off the left padding of the chunk that appears in the
                // first chunk and every chunk for Android browser 2 and 3
                chunk = chunk.replace(/^\s+/, "");
                // The chunk should be not empty for correct parsing, 
                if (chunk) {
                    var i; 
                    // String.prototype.split with string separator is reliable cross-browser
                    var lines = (buffer + chunk).split("\n\n");
                    
                    for (i = 0; i < lines.length - 1; i++) {
                        socket.receive(lines[i].substring("data: ".length));
                    }
                    buffer = lines[lines.length - 1];
                }
            };
            return self;
        },
        // Streaming - XMLHttpRequest
        streamxhr: function(socket, options) {
            var xhr;
            var self = transports.streambase(socket, options);
            
            if ((util.browser.msie && util.browser.vmajor < 10) || (util.browser.opera && util.browser.vmajor < 13) || (options.crossOrigin && !util.corsable)) {
                return;
            }
            
            self.open = function() {
                var index;
                var length; 
                var url = self.uri.open();
                
                xhr = util.xhr();
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 3 && xhr.status === 200) {
                        length = xhr.responseText.length;
                        if (!index) {
                            socket.fire("open");
                            self.parse(xhr.responseText);
                        } else if (length > index) {
                            self.parse(xhr.responseText.substring(index));
                        }
                        index = length;
                    } else if (xhr.readyState === 4) {
                        socket.fire("close", xhr.status === 200 ? "done" : "error");
                    }
                };
                xhr.open("GET", url);
                if (util.corsable) {
                    xhr.withCredentials = true;
                }
                xhr.send(null);
            };
            self.abort = function() {
                xhr.abort();
            };
            return self;
        },
        // Streaming - XDomainRequest
        streamxdr: function(socket, options) {
            var xdr;
            var XDomainRequest = window.XDomainRequest;
            var self = transports.streambase(socket, options);
            
            if (!XDomainRequest || !options.xdrURL) {
                return;
            }
            
            self.open = function() {
                var index;
                var length; 
                var url = options.xdrURL.call(socket, self.uri.open());
                
                xdr = new XDomainRequest();
                xdr.onprogress = function() {
                    length = xdr.responseText.length;
                    if (!index) {
                        socket.fire("open");
                        self.parse(xdr.responseText);
                    } else {
                        self.parse(xdr.responseText.substring(index));
                    }
                    index = length;
                };
                xdr.onerror = function() {
                    socket.fire("close", "error");
                };
                xdr.onload = function() {
                    socket.fire("close", "done");
                };
                xdr.open("GET", url);
                xdr.send();
            };
            self.abort = function() {
                xdr.abort();
            };
            return self;
        },
        // Streaming - Iframe
        streamiframe: function(socket, options) {
            var doc;
            var stop;
            var ActiveXObject = window.ActiveXObject;
            var self = transports.streambase(socket, options);
            
            if (!ActiveXObject || options.crossOrigin) {
                return;
            } else {
                // Internet Explorer 10 Metro doesn't support ActiveXObject
                try {
                    new ActiveXObject("htmlfile");
                } catch (e) {
                    return;
                }
            }
            
            self.open = function() {
                var iframe; 
                var cdoc;
                var url = self.uri.open();
                
                function iterate(fn) {
                    var timeoutId;
                    // Though the interval is 1ms for real-time application, there is a delay between setTimeout calls
                    // For detail, see https://developer.mozilla.org/en/window.setTimeout#Minimum_delay_and_timeout_nesting
                    (function loop() {
                        timeoutId = setTimeout(function() {
                            if (fn() === false) {
                                return;
                            }
                            loop();
                        }, 1);
                    })();
                    return function() {
                        clearTimeout(timeoutId);
                    };
                }
                
                doc = new ActiveXObject("htmlfile");
                doc.open();
                doc.close();
                iframe = doc.createElement("iframe");
                iframe.src = url;
                doc.body.appendChild(iframe);
                cdoc = iframe.contentDocument || iframe.contentWindow.document;
                stop = iterate(function() {
                    // Response container
                    var container;
                    
                    function readDirty() {
                        var text;
                        var clone = container.cloneNode(true);
                        // Adds a character not CR and LF to circumvent an Internet Explorer bug
                        // If the contents of an element ends with one or more CR or LF, Internet Explorer ignores them in the innerText property
                        clone.appendChild(cdoc.createTextNode("."));
                        // But the above idea causes \n chars to be replaced with \r\n or for some reason
                        // Restores them to its original state
                        text = clone.innerText.replace(/\r\n/g, "\n");
                        return text.substring(0, text.length - 1);
                    }
                    
                    // Waits the server's container ignorantly
                    if (!cdoc.firstChild) {
                        return;
                    }
                    container = cdoc.body.lastChild;
                    // Detects connection failure
                    if (!container) {
                        socket.fire("close", "error");
                        return false;
                    }
                    socket.fire("open");
                    self.parse(readDirty());
                    // The container is resetable so no index or length variable is needed
                    container.innerText = "";
                    stop = iterate(function() {
                        var text = readDirty();
                        if (text) {
                            container.innerText = "";
                            self.parse(text);
                        }
                        if (cdoc.readyState === "complete") {
                            socket.fire("close", "done");
                            return false;
                        }
                    });
                    return false;
                });
            };
            self.abort = function() {
                stop();
                doc.execCommand("Stop");
            };
            return self;
        },
        // Long polling Base
        longpollbase: function(socket, options) {
            var self = transports.httpbase(socket, options);
            self.uri.poll = function(eventIds) {
                return util.url(options.url, {id: options.id, when: "poll", lastEventIds: eventIds.join(",")});
            };
            self.open = function() {
                self.connect(self.uri.open(), function() {
                    function poll(eventIds) {
                        self.connect(self.uri.poll(eventIds), function(data) {
                            if (data) {
                                var i;
                                var eventIds = []; 
                                var obj = util.parseJSON(data); 
                                var array = !util.isArray(obj) ? [obj] : obj;
                                    
                                for (i = 0; i < array.length; i++) {
                                    eventIds.push(array[i].id);
                                }
                                poll(eventIds);
                                for (i = 0; i < array.length; i++) {
                                    socket.receive(util.stringifyJSON(array[i]));
                                }
                            } else {
                                socket.fire("close", "done");
                            }
                        });
                    }
                    
                    poll([]);
                    socket.fire("open");
                });
            };
            return self;
        },
        // Long polling - AJAX
        longpollajax: function(socket, options) {
            var xhr;
            var self = transports.longpollbase(socket, options);
            
            if (options.crossOrigin && !util.corsable) {
                return;
            }
            
            self.connect = function(url, fn) {
                xhr = util.xhr();
                xhr.onreadystatechange = function() {
                    // Avoids c00c023f error on Internet Explorer 9
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            fn(xhr.responseText);
                        } else {
                            socket.fire("close", "error");
                        }
                    }
                };
                xhr.open("GET", url);
                if (util.corsable) {
                    xhr.withCredentials = true;
                }
                xhr.send(null);
            };
            self.abort = function() {
                xhr.abort();
            };
            return self;
        },
        // Long polling - XDomainRequest
        longpollxdr: function(socket, options) {
            var xdr;
            var XDomainRequest = window.XDomainRequest;
            var self = transports.longpollbase(socket, options);
            
            if (!XDomainRequest || !options.xdrURL) {
                return;
            }

            self.connect = function(url, fn) {
                url = options.xdrURL.call(socket, url);
                xdr = new XDomainRequest();
                xdr.onload = function() {
                    fn(xdr.responseText);
                };
                xdr.onerror = function() {
                    socket.fire("close", "error");
                };
                xdr.open("GET", url);
                xdr.send();
            };
            self.abort = function() {
                xdr.abort();
            };
            return self;
        },
        // Long polling - JSONP
        longpolljsonp: function(socket, options) {
            var script;
            var callback = jsonpCallbacks.pop() || ("socket_" + (guid++));
            var self = transports.longpollbase(socket, options);
            
            // Attaches callback
            window[callback] = function(data) {
                script.responseText = data;
            };
            socket.once("close", function() {
                // Assings an empty function for browsers which are not able to cancel a request made from script tag
                window[callback] = function() {};
                jsonpCallbacks.push(callback);
            });
            self.uri._open = self.uri.open;
            self.uri.open = function() {
                return self.uri._open.apply(self, arguments) + "&callback=" + callback;
            };
            self.connect = function(url, fn) {
                script = document.createElement("script");
                script.async = true;
                script.src = url;
                script.clean = function() {
                    // Assigns null to attributes to avoid memory leak in IE
                    script.clean = script.onerror = script.onload = script.onreadystatechange = null;
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                };
                script.onload = script.onreadystatechange = function() {
                    if (!script.readyState || /loaded|complete/.test(script.readyState)) {
                        if (script.clean) {
                            script.clean();
                        }
                        fn(script.responseText);
                    }
                };
                script.onerror = function() {
                    script.clean();
                    socket.fire("close", "error");
                };
                head.insertBefore(script, head.firstChild);                        
            };
            self.abort = function() {
                if (script.clean) {
                    script.clean();
                }
            };
            return self;
        }
    };
    
    // Defines the vibe
    var vibe = {};
    // Socket instances
    var sockets = [];

    // Creates a new socket and connects to the given url
    vibe.open = function(url, options) {
        // Opens a new socket
        var socket = Socket(url, options);
        sockets.push(socket);
        return socket; 
    };
    // Exposes to help debug or apply hotfix but not public
    vibe.util = util;
    vibe.transports = transports;
    
    // For browser environment
    util.on(window, "unload", function() {
        unloading = true;
        var i;
        var socket;
        for (i = 0; i < sockets.length; i++) {
            socket = sockets[i];
            // Closes a socket as the document is unloaded
            if (socket.state() !== "closed") {
                socket.close();
            }
        }
    });
    util.on(window, "online", function() {
        var i;
        var socket;
        for (i = 0; i < sockets.length; i++) {
            socket = sockets[i];
            // Opens a socket because of no reason to wait
            if (socket.state() === "waiting") {
                socket.open();
            }
        }
    });
    util.on(window, "offline", function() {
        var i;
        var socket;
        for (i = 0; i < sockets.length; i++) {
            socket = sockets[i];
            // Fires a close event immediately
            if (socket.state() === "opened") {
                socket.fire("close", "error");
            }
        }
    });
    
    return vibe;
}));