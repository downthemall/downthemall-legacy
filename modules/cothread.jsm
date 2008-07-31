/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll CoThread module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = ['CoThread', 'CoThreadListWalker'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const TYPE_REPEATING_SLACK = Ci.nsITimer.TYPE_REPEATING_SLACK;
const Timer = Components.Constructor('@mozilla.org/timer;1', 'nsITimer', 'initWithCallback');

// "Abstract" base c'tor
function CoThreadBase(func, yieldEvery, thisCtx) {
	this._thisCtx = thisCtx ? thisCtx : this;
	
	// default to 1
	this._yieldEvery = typeof yieldEvery == 'number' ? Math.floor(yieldEvery) : 1;
	if (yieldEvery < 1) {
		throw Cr.NS_ERROR_INVALID_ARG;
	}
	
	if (typeof func != 'function' && !(func instanceof Function)) {
		throw Cr.NS_ERROR_INVALID_ARG;
	} 
	this._func = func;
}

/**
 * Constructs a new CoThread (aka. pseudo-thread).
 * A CoThread will repeatedly call a specified function, but "breaking"
 * the operation temporarily after a certain ammount of calls,
 * so that the main thread gets a chance to process any outstanding
 * events.
 * 
 * Example:
 *        Components.utils.import('resource://dta/cothread.jsm');
 *        new CoThread(
 *        	// What to do with each item?
 *          // Print it!
 *          function(count) document.write(count + "<br>") || (count < 30000),
 *          // When to turn over Control?
 *          // Each 1000 items
 *          1000
 *        ).run();
 *   
 * @param {Object} func Function to be called. Is passed call count as argument. Returning false will cancel the operation. 
 * @param {Object} yieldEvery Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx Optional. The function will be called in the scope of this object (or if omitted in the scope of the CoThread instance)
 */
function CoThread(func, yieldEvery, thisCtx) {
	CoThreadBase.call(this, func, yieldEvery, thisCtx);
	this._generator = (function() { for(;;) { yield null }; })();
}

CoThread.prototype = {
	
	_idx: 0,
	_ran: false,
	
	run: function() {
		if (this._ran) {
			throw new Error("You cannot run a CoThread/CoThreadListWalker instance more than once.");
		}
		this._ran = true;
		this._timer = new Timer(this, 10, TYPE_REPEATING_SLACK);		
	},
	
	QueryInterface: function CoThread_QueryInterface(iid) {
		if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsITimerCallback)) {
			return this;
		}
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
	
	notify: function CoThread_notify() {
		let y = this._yieldEvery;
		let g = this._generator;
		let f = this._func;
		let ctx = this._thisCtx;
		let callf = this._callf;
		try {		
			for (let i = 0; i < y; ++i) {
				if (!callf(ctx, g.next(), this._idx++, f)) {
					throw 'complete';
				}
			}
		}
		catch (ex) {
			this.cancel();			
		}
	},
	
	cancel: function CoThread_cancel() {
		this._timer.cancel();
	},
	
	_callf: function CoThread_callf(ctx, item, idx, func) {
		return func.call(ctx, idx);
	}
}

/**
 * Constructs a new CoThreadListWalker (aka. pseudo-thread).
 * A CoThreadListWalker will walk a specified list and call a specified function
 * on each item, but "breaking" the operation temporarily after a
 * certain ammount of processed items, so that the main thread may
 * process any outstanding events.
 * 
 * Example:
 *        Components.utils.import('resource://dta/cothread.jsm');
 *        new CoThreadListWalker(
 *        	// What to do with each item?
 *          // Print it!
 *          function(item, idx) document.write(item + "/" + idx + "<br>") || true,
 *          // What items?
 *          // 0 - 29999
 *          (function() { for (let i = 0; i < 30000; ++i) yield i; })(),
 *          // When to turn over Control?
 *          // Each 1000 items
 *          1000
 *        ).run();
 *   
 * @param {Object} func Function to be called on each item. Is passed item and index as arguments. Returning false will cancel the operation. 
 * @param {Object} arrayOrGenerator Array or Generator object to be used as the input list 
 * @param {Object} yieldEvery Optional. After how many items control should be turned over to the main thread
 * @param {Object} thisCtx Optional. The function will be called in the scope of this object (or if omitted in the scope of the CoThread instance)
 */
function CoThreadListWalker(func, arrayOrGenerator, yieldEvery, thisCtx) {
	CoThreadBase.call(this, func, yieldEvery, thisCtx);
	
	if (arrayOrGenerator instanceof Array) {
		// make a generator
		this._generator = (i for each (i in arrayOrGenerator));
	}
	else if (typeof arrayOrGenerator != 'function' && !(arrayOrGenerator instanceof Function)) {
		this._generator = arrayOrGenerator;
	}
	else {
		throw Cr.NS_ERROR_INVALID_ARG;
	}
}

// not just b.prototype = a.prototype, because we wouldn't then be allowed to override methods 
for (x in CoThread.prototype) {
	CoThreadListWalker.prototype[x] = CoThread.prototype[x];
}
CoThreadListWalker.prototype._callf = function CoThreadListWalker_callf(ctx, item, idx, func) {
	return func.call(ctx, item, idx);
}
