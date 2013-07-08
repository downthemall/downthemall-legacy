/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const {defer} = require("support/defer");

const CoThreadBase = {
	_idx: 0,
	_ran: false,
	_finishFunc: null,

	init: function CoThreadBase_init(func, yieldEvery, thisCtx) {
		this._thisCtx = thisCtx ? thisCtx : this;

		// default to 0 (adjust)
		this._yieldEvery = typeof yieldEvery === 'number' ? Math.floor(yieldEvery) : 0;

		if (typeof func !== 'function' && !(func instanceof Function)) {
			throw Cr.NS_ERROR_INVALID_ARG;
		}
		this._func = func;
		this.init = function() {};
	},

	start: function CoThreadBase_run(finishFunc) {
		if (this._ran) {
			throw new Error("You cannot run a CoThread/CoThreadListWalker instance more than once.");
		}
		this._finishFunc = finishFunc;
		this._ran = true;
		defer(this, 0);
	},

	QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsICancelable, Ci.nsIRunnable]),

	_terminated: false,

	run: function CoThreadBase_run() {
		if (this._terminated) {
			return;
		}

		let y = this._yieldEvery;
		let g = this._generator;
		let f = this._func;
		let ctx = this._thisCtx;
		let callf = this._callf;
		try {
			if (y > 0) {
				let start = +new Date();
				for (let i = 0; i < y; ++i) {
					if (!callf(ctx, g.next(), this._idx++, f)) {
						throw 'complete';
					}
				}
				let diff = (+new Date()) - start;
				if (diff > 150 || diff < 30) {
					this._yieldEvery = Math.max(1, Math.round(y * 60 / diff));
				}
			}
			else {
				// adjustment pass
				let start = +new Date();
				let i = 0;
				for(; start + 60 > +new Date(); ++i) {
					if (!callf(ctx, g.next(), this._idx++, f)) {
						throw 'complete';
					}
				}
				this._yieldEvery = Math.max(i, 1);
			}
			if (!this._terminated) {
				defer(this);
			}
		}
		catch (ex) {
			this.cancel();
		}
	},

	cancel: function CoThreadBase_cancel() {
		if (this._terminated) {
			return;
		}
		this._terminated = true;
		if (this._finishFunc) {
			this._finishFunc.call(this._thisCtx, this._yieldEvery);
		}
	}
};

/**
 * Constructs a new CoThread (aka. pseudo-thread).
 * A CoThread will repeatedly call a specified function, but "breaking"
 * the operation temporarily after a certain amount of calls,
 * so that the main thread gets a chance to process any outstanding
 * events.
 *
 * Example:
 *        new CoThread(
 *          // What to do with each item?
 *          // Print it!
 *          function(count) document.write(count + "<br>") || (count < 30000),
 *          // When to turn over Control?
 *          // Each 1000 items
 *          1000
 *        ).start();
 *
 * @param {Function} func
 *                   Function to be called. Is passed call count as argument.
 *                   Returning false will cancel the operation.
 * @param {Number} yieldEvery
 *                 Optional. After how many items control should be turned over to the main thread.
 * @param {Object} thisCtx
 *                 Optional. The function will be called in the scope of this object
 *                 (or if omitted in the scope of the CoThread instance)
 */
exports.CoThread = function CoThread(func, yieldEvery, thisCtx) {
	this.init(func, yieldEvery, thisCtx);
	// fake generator so we may use a common implementation. ;)
	this._generator = (function() {
		for(;;) {
			yield null;
		}
	})();
};
exports.CoThread.prototype = Object.create(CoThreadBase, {
	_callf: {
		value: function CoThread__callf(ctx, i, idx, fn) fn.call(ctx, idx),
		enumerable: true
	}
});

/**
 * Constructs a new CoThreadInterleaved (aka. pseudo-thread).
 * The CoThread will process a interleaved function (generator)
 *
 * Example:
 *        new CoThread(
 *          function(count) {
 *            do_some();
 *            yield true;
 *            do_more();
 *            yield true;
 *            if (!do_even_more()) {
 *              return;
 *            }
 *            do_last();
 *          },
 *          // When to turn over Control?
 *          // Each 2 items
 *          2
 *        ).start();
 *
 * @param {Function} func
 *                   Function to be called. Is passed call count as argument.
 *                   Returning false will cancel the operation.
 * @param {Number} yieldEvery
 *                 Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx
 *                 Optional. The function will be called in the scope of this object
 *                 (or if omitted in the scope of the CoThread instance)
 */
exports.CoThreadInterleaved = function CoThreadInterleaved(generator, yieldEvery, thisCtx) {
	this.init(function() true, yieldEvery, thisCtx);
	this._generator = typeof(generator) === "function" ? generator() : generator;
};
exports.CoThreadInterleaved.prototype = Object.create(CoThreadBase, {
	_callf: {
		value: function() true,
		enumerable: true
	}
});

/**
 * Constructs a new CoThreadListWalker (aka. pseudo-thread).
 * A CoThreadListWalker will walk a specified list and call a specified function
 * on each item, but "breaking" the operation temporarily after a
 * certain amount of processed items, so that the main thread may
 * process any outstanding events.
 *
 * Example:
 *        new CoThreadListWalker(
 *          // What to do with each item?
 *          // Print it!
 *          function(item, idx) document.write(item + "/" + idx + "<br>") || true,
 *          // What items?
 *          // 0 - 29999
 *          (function() { for (let i = 0; i < 30000; ++i) yield i; })(),
 *          // When to turn over Control?
 *          // Each 1000 items
 *          1000,
 *          null,
 *        ).start(function() alert('done'));
 *
 * @param {Function} func
 *                   Function to be called on each item. Is passed item and index as arguments.
 *                   Returning false will cancel the operation.
 * @param {Array/Generator} arrayOrGenerator
 *                          Array or Generator object to be used as the input list
 * @param {Number} yieldEvery
 *                 Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx
 *                 Optional. The function will be called in the scope of this object
 *                  (or if omitted in the scope of the CoThread instance)
 */
exports.CoThreadListWalker = function CoThreadListWalker(func, arrayOrGenerator, yieldEvery, thisCtx) {
	this.init(func, yieldEvery, thisCtx);

	if (arrayOrGenerator instanceof Array || 'length' in arrayOrGenerator) {
		// make a generator
		this._generator = (function() {
			for (let i of arrayOrGenerator) {
				yield i;
			}
		})();
	}
	else {
		this._generator = arrayOrGenerator;
	}

	if (this._lastFunc && (typeof func !== 'function' && !(func instanceof Function))) {
		throw Cr.NS_ERROR_INVALID_ARG;
	}
};
exports.CoThreadListWalker.prototype = Object.create(CoThreadBase, {
	_callf: {
		value: function CoThreadListWalker__callf(ctx, item, idx, fn) fn.call(ctx, item, idx),
		enumerable: true
	}
});
