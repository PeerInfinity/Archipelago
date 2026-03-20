/**
 * Minimal lodash shim providing _.memoize and _.throttle
 * Required by cytoscape-edgehandles UMD build.
 */
(function(root) {
  if (!root._) root._ = {};

  // _.memoize — cache function results by first argument
  if (!root._.memoize) {
    root._.memoize = function memoize(func, resolver) {
      var cache = new Map();
      var memoized = function() {
        var key = resolver ? resolver.apply(this, arguments) : arguments[0];
        if (cache.has(key)) return cache.get(key);
        var result = func.apply(this, arguments);
        cache.set(key, result);
        memoized.cache = cache;
        return result;
      };
      memoized.cache = cache;
      return memoized;
    };
  }

  // _.throttle — limit function calls to at most once per wait period
  if (!root._.throttle) {
    root._.throttle = function throttle(func, wait, options) {
      var timeout, context, args, result;
      var previous = 0;
      if (!options) options = {};

      var later = function() {
        previous = options.leading === false ? 0 : Date.now();
        timeout = null;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      };

      var throttled = function() {
        var now = Date.now();
        if (!previous && options.leading === false) previous = now;
        var remaining = wait - (now - previous);
        context = this;
        args = arguments;
        if (remaining <= 0 || remaining > wait) {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          previous = now;
          result = func.apply(context, args);
          if (!timeout) context = args = null;
        } else if (!timeout && options.trailing !== false) {
          timeout = setTimeout(later, remaining);
        }
        return result;
      };

      throttled.cancel = function() {
        clearTimeout(timeout);
        previous = 0;
        timeout = context = args = null;
      };

      return throttled;
    };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
