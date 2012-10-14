//     noconflict.js, version 0.1
//     (c) 2011-2012 Matt Brown
//     License: BSD (see LICENSE)
(function () {
    // Environment
    // ===========

    // Save a reference to the global object.
    var root = this;

    // Save a reference to the previous `NoConflict` object.
    var prevNC = root.NoConflict;

    // The current version.
    var VERSION = '0.1';

    // Constant representing all cached symbols.
    var ALL_SYMBOLS = '__all__';

    // Tests whether the argument is an array.  Uses the native `isArray` where available.
    var isArray = Array.isArray || function (obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    };

    // Tests whether the argument is a function.
    var isFunction = function (obj) {
        return typeof obj === 'function';
    };

    // Get the own property names from an object.
    var keys = function (obj) {
        var result = [];

        for (var key in obj) {
            obj.hasOwnProperty(key) && result.push(key);
        }

        return result;
    };

    // Create a copy of an object's own properties.
    var clone = function (src) {
        var dest = {};

        for (var name in src) {
            if (src.hasOwnProperty(name)) {
                dest[name] = src[name];
            }
        }

        return dest;
    };

    // Extend an object with another object's properties.
    var extend = function (obj, ext) {
        for (var name in ext) {
            obj[name] = ext[name];
        }

        return obj;
    };


    // Class - NoConflict
    // ==================
    // For most use cases, the default options for the constructor should suffice.
    // Use the `context` method to get a new instance with custom options, or
    // change options directly on the global object.
    var NoConflict = function (options) {
        options || (options = {});

        this._settings = {
            // If configured as the global instance, the object can conflict-manage itself.
            global: false,

            // Context object: symbols are resolved and conflict management performed relative to this object.
            context: root,

            // useNative: if `true` (the default), use the native `noConflict` method of each symbol, where available.
            useNative: true,

            // ensureDefined: if `true`, replace a symbol from cache only if the cached object is defined. Default: `false`
            ensureDefined: false
        };

        extend(this._settings, options);

        // Cache for pre-conflict objects.
        this._symbolCache = {};
    };

    NoConflict.prototype.version = VERSION;
    NoConflict.prototype.ALL = ALL_SYMBOLS;

    // useNative (value)
    // -----------------
    // Get or set the value for the `useNative` option.
    NoConflict.prototype.useNative = function (value) {
        return typeof value === 'undefined' ? this._settings.useNative : (this._settings.useNative = !!value);
    };

    // ensureDefined (value)
    // ---------------------
    // Get or set the value for the `ensureDefined` option.
    NoConflict.prototype.ensureDefined = function (value) {
        return typeof value === 'undefined' ? this._settings.ensureDefined : (this._settings.ensureDefined = !!value);
    };

    // context (options)
    // -----------------
    // Factory method.
    NoConflict.context = NoConflict.prototype.context = function (options) {
        return new NoConflict(options);
    };

    // cache (symbols [, context])
    // ------------------------
    // Cache the object[s] currently assigned to the given `symbols` for later conflict management.
    // Each argument is assumed to be a symbol. Alternatively, a single argument can be passed that is
    // an array of symbols.
    NoConflict.prototype.cache = function () {
        if (arguments.length === 1 && isArray(arguments[0])) {
            return this.cache.apply(this, arguments[0]);
        }

        for (var i = 0; i < arguments.length; i++) {
            this.check(arguments[i]);
        }

        return this;
    };

    // mixin (symbol [, context])
    // --------------------------
    // Return a mixin object that provides a custom `noConflict` method for the given symbol[s].
    // The `noConflict` method returns a single value for a single symbol; else a mapping of symbols to values.
    NoConflict.prototype.mixin = function () {
        var symbols = arguments.length > 1 ? Array.prototype.slice.call(arguments) : arguments[0],
            nc = this.context(extend(clone(this._settings), {global: false, useNative: false})),
            mixin = {
                noConflict: function () {
                    return isArray(symbols) ? nc.noConflict.apply(nc, symbols).get() : nc.noConflict(symbols);
                }
            };

        nc.cache(symbols);

        return mixin;
    };

    // noConflict (args...)
    // -------------------
    // Normalized `noConflict` method: assigns a symbol or symbols to their previous values, and returns current
    // values.
    //
    // Each argument can be a string indicating a symbol, or an array: `[symbol, nc_args...]`, where
    // `nc_args` is one or more arguments to pass to the object's native `noConflict` method (where applicable).
    // The return value is a single object in the case where one symbol is specified; else a namespace object.
    //
    // (See `NoConflictNamespace` for more info.)
    //
    // ### noConflict ()
    // In this mode, resets the global `NoConflict` object to its previous value and returns the current value.
    //
    // ### noConflict (NoConflict.ALL)
    // In this mode, return a namespace object containing all cached symbols and their current values.
    NoConflict.prototype.noConflict = function () {
        if (arguments.length) {
            if (arguments.length === 1 && arguments[0] !== this.ALL) {
                var symbol = arguments[0], nc_args = [];

                if (isArray(symbol)) {
                    nc_args = symbol.slice(1);
                    symbol = symbol.shift();
                }

                var instance = this.resolve(symbol);
                if (instance && this._settings.useNative && isFunction(instance.noConflict)) {
                    var result = instance.noConflict.apply(instance, nc_args);

                    if (this.ensureDefined() && typeof this.resolve(symbol) === 'undefined') {
                        this.reset(symbol, result);
                    }

                    return result;
                }

                this.reset(symbol, this._symbolCache[symbol]);

                return instance;
            }

            var ns = new NoConflictNamespace,
                args = arguments;

            if (args[0] === this.ALL) {
                args = keys(this._symbolCache);
            }
            for (var i = 0; i < args.length; i++) {
                ns.set(isArray(args[i]) ? args[i][0] : args[i], this.noConflict(args[i]));
            }

            return ns;
        }

        if (this._settings.global) {
            this.reset('NoConflict', prevNC);
            this._settings.global = false;
        }

        return this;
    };

    // resolve (symbol [, context])
    // ----------------------------
    // Match a `symbol` (e.g. `'jQuery'`, `'$.fn.metadata'`) to the object it references.
    // Return the object assigned to the `symbol`, or `undefined`.  If the `context` parameter
    // is specified, resolve the symbol relative to that object; else use the `global` object.
    NoConflict.prototype.resolve = function (symbol, context) {
        context || ( context = this._settings.context );
        isArray(symbol) || (symbol = symbol.split('.'));

        context = context[symbol.shift()];

        if (!symbol.length || typeof context === 'undefined') {
            return context;
        }

        return this.resolve(symbol, context);
    };

    // check (symbol)
    // --------------------------
    // Determine whether the `symbol` specified already matches a real object, and if so, cache the object.
    NoConflict.prototype.check = function (symbol) {
        var instance = this.resolve(symbol);

        if (instance) {
            this._symbolCache[symbol] = instance;
            return instance;
        }

        return false;
    };

    // reset (symbol, instance)
    // ------------------------------------
    // Replace the current value matching `symbol` with the `instance`, and return the `NoConflict` object.
    //
    // If the replacement `instance` is `undefined`, `reset` removes the object reference altogether. (Exception:
    // when the `ensureDefined` option is set, nothing happens.)
    NoConflict.prototype.reset = function (symbol, instance) {
        var parts = (symbol || '').split('.'),
            instanceName = parts.pop(),
            context = parts.length ? this.resolve(parts) : this._settings.context;

        if (!/undefined/.test(typeof context + typeof instanceName)) {
            if (typeof instance === 'undefined') {
                if (!this.ensureDefined()) {
                    delete context[instanceName];
                }
            }
            else {
                context[instanceName] = instance;
            }
        }

        return this;
    };

    // clear ()
    // --------
    // Erases the symbol cache.
    NoConflict.prototype.clear = function () {
        this._symbolCache = {};
    };


    // Class - NoConflictNamespace
    // =========================
    // An insert-order preserving hash.  (Use the provided `get`, `set` methods instead of directly manipulating
    // the object.)
    var NoConflictNamespace = function () {
        this._keys = [];
        this._data = {};
    };

    // set (name, value)
    // -----------------
    // Set the `value` indicated by `name`, keeping track of the order new names are inserted.
    NoConflictNamespace.prototype.set = function (name, value) {
        if (!(name in this._data)) {
            this._keys.push(name);
        }

        this._data[name] = value;

        return this;
    };

    // get (name)
    // ----------
    // Fetch the value for `name` if `name` is provided; else the complete mapping (unordered).
    NoConflictNamespace.prototype.get = function (name) {
        if (name) {
            return this._data[name];
        }

        return this._data;
    };

    // getValues (symbols)
    // -------------------
    // Returns an array of all values in the namespace, either in insert order or the order specified by `symbols`.
    NoConflictNamespace.prototype.getValues = function (symbols) {
        var values = [],
            iterKeys = symbols ? symbols : this._keys;

        for (var i = 0; i < iterKeys.length; i++) {
            values.push(this.get(iterKeys[i]));
        }

        return values;
    };

    // with (handler [, thisObj])
    // --------------------------
    // Emulate a `with` statement on the namespace by passing values to a handler function in order of insertion.
    // (Actually this is more useful than `with`, because the scope created by `with` doesn't extend to function calls.)
    //
    // By default, `this` references the namespace object, providing for an alternative means of accessing values, e.g.:
    //     var $ = this.get('jQuery')
    //
    // The optional `thisObj` parameter sets `thisObj` as `this` in the handler.
    //
    // ### with (symbols, handler [, thisObj])
    // Emulate a `with` statement as above, except pass values to the handler in the order indicated by `symbols`.
    NoConflictNamespace.prototype.with = function (symbols, handler, thisObj) {
        isFunction(symbols) && (thisObj = handler, handler = symbols, symbols = null);
        isFunction(handler) && handler.apply(thisObj || this, this.getValues(symbols));
    };

    // Expose the namespace class as a property available to `NoConflict` instances.
    NoConflict.prototype.Namespace = NoConflictNamespace;


    // Exports
    // ========

    // Create the global `NoConflict` instance.
    root['NoConflict'] = NoConflict.context({global: 'true'});

    //Register [AMD](https://github.com/amdjs/amdjs-api/wiki/AMD) module, if applicable.
    typeof define === 'function' && define('noconflict', [], function () {
        return root.NoConflict;
    });

}).call(null);
