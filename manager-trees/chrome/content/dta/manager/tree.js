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
 * The Original Code is DownThemAll!
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *	 Nils Maier <MaierMan@web.de>
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
 
 /**
 * implemtents nsITreeView
 * manages our link trees
 */
function Tree(elem) {
	
	this.elem = elem;

	this._downloads = [];

	// atom cache. See getAtom
	this._atoms = {};
	this._iconic = this._as.getAtom('iconic');
	this.elem.view = this;	
}
Tree.prototype = {

	// will use it quite often.
	// 'properties' need to be an atom.
	_as: Cc["@mozilla.org/atom-service;1"]
		.getService(Ci.nsIAtomService),

	// get atoms, but provide caching.
	// we have a limited set of atoms anyway, so we don't have to expect a huge cache.
	getAtom: function(str) {
		if (!(str in this._atoms)) {
			this._atoms[str] = this._as.getAtom(str);
		}
		return this._atoms[str];
	},

	/*
	 * actual nsITreeView follows
	 */
	get rowCount() {
		return this._downloads.length;
	},

	// used to initialize nsITreeview and provide the corresponding treeBoxObject
	setTree: function(box) {
		this._box = box;
	},

	getParentIndex: function(idx) {
		// no parents, as we are actually a list
		return -1;
	},
	getLevel: function(idx) {
		// ... and being a list all nodes are on the same level
		return 0;
	},
	
	getCellText: function(idx, col) {
		var d = this._downloads[idx];

		switch (col.id) {
			case 'task': return Prefs.showOnlyFilenames ? d.destinationName : d.urlManager.usable;
			case 'per': return d.percent;
			case 'dim': return d.dimensionString;
			case 'status': return d.status;
			case 'parts': return d.parts;
			case 'mask': return d.mask;
			case 'path': return d.destinationPath;
			case 'speed': return d.speed;
		}
		return '';
	},

	isSorted: function() {
		// not sorted
		return false;
	},
	isContainer: function(idx) {
		// being a container means we got children... but we don't have any children because we're a list actually
		return false;
	},
	isContainerOpen: function(idx) {
		return false;
	},
	isContainerEmpty: function(idx) {
		return false;
	},

	isSeparator: function(idx) {
		// no separators
		return false;
	},

	isEditable: function(idx) {
		// and nothing is editable
		return true;
	},

	// will grab the "icon" for a cell.
	getImageSrc: function(idx, col) {
		switch (col.id) {
			case 'task': return this._downloads[idx].icon;
		}
		return null;
	},

	getProgressMode : function(idx, col) {
		if (col.id == 'pct') {
			return Ci.nsITreeView.PROGRESS_NORMAL;
		}
		return Ci.nsITreeView.PROGRESS_NONE;
	},

	// will be called for cells other than textcells
	getCellValue: function(idx, col) {
		if (col.id == 'pct') {
			var d = this._downloads[idx];
			if (d.is(CANCELED)) {
				return 100;	
			}
			return d.totalSize ? d.partialSize * 100 / d.totalSize : 0;
		}
		return null;
	},

	// called when a header is called.
	// would be the place to change sort mode. But we don't have any sorting.
	cycleHeader: function(col, elem) {},

	// just some stubs we need to provide anyway to provide a full nsITreeView
	selectionChanged: function() {},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getColumnProperties: function(column, element, prop) {},

	getRowProperties: function(idx, prop) {
	},
	getCellProperties: function(idx, col, prop) {
		if (col.id == 'pct') {
			var d = this._downloads[idx];
			if (d.is(COMPLETE)) {
				prop.AppendElement(this.getAtom('completed'));
			}
			else if (d.is(PAUSED)) {
				prop.AppendElement(this.getAtom('paused'));
			}
			else if (d.is(RUNNING)) {
				prop.AppendElement(this.getAtom('inprogress'));
			}
			else if (d.is(CANCELED)) {
				prop.AppendElement(this.getAtom('canceled'));
			}
		}
		else if (col.id == 'task') {
			prop.AppendElement(this._iconic);
		}
	},

	// called when the user clicks our checkboxen
	setCellValue: function(idx, col, value) {
	},
	
	selectionChanged: function() {
		this.refreshTools();
	},
	_updating: 0,
	beginUpdate: function() {
		if (++this._updating == 1) {
			this._box.beginUpdateBatch();
		}
	},
	endUpdate: function() {
		if (--this._updating == 0) {
			this._box.endUpdateBatch();
			this.refreshTools();
		}
	},
	
	// stuff
	add: function(download) {
		this._downloads.push(download);
		download._tid = this._downloads.length - 1;
		this._box.rowCountChanged(download._tid, 1);
	},
	
	// d = null -> selection, d = downloadE, d = array -> all in list
	remove: function(downloads) {
		
		if (downloads instanceof Array) {
			// map to the actual ids and sort them in descending(!) order.
			var ids = downloads
				.sort(function(a, b) { return b._tid - a._tid; });
		}
		else if (downloads) {
			var ids = [downloads];
		}
		else {
			var ids = this._getSelectedIds(true).map(
				function(idx) {
					return this._downloads[idx]; 
				},
				this
			);
		}
		sessionManager.beginUpdate();
		this.beginUpdate();
		ids.forEach(
			function(d) {
				// wipe out any info/tmpFiles
				if (!d.is(COMPLETE, CANCELED)) {
					d.cancel();
				}
				sessionManager.deleteDownload(d);
				this._downloads.splice(d._tid, 1);
				delete d._tid;
			},
			this
		);
		this.endUpdate();
		sessionManager.endUpdate();
		this.invalidate();
	},
	removeCompleted: function() {
		var list = [];
		for (var i = 0, e = this._downloads.length; i < e; ++i) {
			if (this._downloads[i].is(COMPLETE)) {
				list.push(this._downloads[i]);
			}
		}
		this.remove(list);
	},
	
	refreshTools: function() {
		if (this._updating) {
			return;
		}
		$('info', 'remove', 'movetop', 'moveup', 'movedown', 'movebottom', 'toolmovetop', 'toolmoveup', 'toolmovedown', 'toolmovebottom')
			.forEach(
				function(o) { return o.setAttribute('disabled', this.current); },
				this
			);
		
		var selected = [];
		for (d in this.selected) {
			selected.push(d);
		}
		function modifySome(items, f) {
			items.forEach(function(o) { return o.setAttribute('disabled', selected.length == 0 || !selected.some(f)); });
		}
		modifySome($('play', 'toolplay'), function(d) { return !d.is(COMPLETE, RUNNING, QUEUED); });
		modifySome($('pause', 'toolpause'), function(d) { return d.is(RUNNING) && d.isResumable || d.is(QUEUED); });
		modifySome($('cancel', 'toolcancel'), function(d) { return !d.is(CANCELED); });
		modifySome($('launch', 'folder', 'delete'), function(d) { return d.is(COMPLETE); });
		modifySome($('addchunk', 'removechunk'), function(d) { return d.is(QUEUED, RUNNING, PAUSED); });
	},
	
	invalidate: function(d) {
		if (!d) {
			this._downloads.forEach(function(e, i) { e._tid = i; });
			this._box.invalidate();
			this.refreshTools();			
		}
		else if (d instanceof Array) {
			this.beginUpdate();
			d.forEach(
				function(e) {
					this.invalidate(e);
				},
				this
			);
			this.endUpdate();
		}
		else if ('_tid' in d) {
			this._box.invalidateRow(d._tid);
		}
	},
	
	get box() {
		return this._box;
	},
	
	// generator for all download elements.
	get all() {
		for (var i = 0, e = this._downloads.length; i < e; ++i) {
			yield this._downloads[i];
		}
	},
	// generator for selected download elements.
	// do not make any assumptions about the order.
	get selected() {
		var select = this.selection;
		var count = select.getRangeCount();
		
		// loop through the selection as usual
		for (var i = 0; i < count; ++i) {
			var start = {}; var end = {};
			select.getRangeAt(i,start,end);
			for (var c = start.value, e = end.value; c <= e; ++c) {
				yield this._downloads[c];
			}
		}
	},
	// returns an ASC sorted array of IDs that are currently selected.
	_getSelectedIds: function(getReversed) {
		var rv = [];
		var rangeCount = this.selection.getRangeCount();
		for (var i = 0; i < rangeCount; ++i) {
				let start = {}, end = {};
				this.selection.getRangeAt(i, start, end);
				for (var c = start.value; c <= end.value; c++) {
					rv.push(c);
				}
		}
		this.selection.clearSelection();
		if (getReversed) {
			rv.sort(function(a, b) { return b - a; });
		}
		else {
			rv.sort(function(a, b) { return a - b; });
		}
		return rv;
	},
	get current() {
		var ci = this.selection.currentIndex;
		if (ci > -1 && ci < this.rowCount) {
			return this._downloads[ci];
		}
		return null;		
	},
	
	at: function(idx) {
		return this._downloads[idx];
	},
	some: function(f, t) {
		return this._downloads.some(f, t);
	},
	every: function(f, t) {
		return this._downloads.every(f, t);
	},
	
	update: function(f, t) {
		this.beginUpdate();
		f.call(t);
		this.endUpdate();
	},
	updateSelected: function(f, t) {
		this.beginUpdate();
		for (d in this.selected) {
			if (!f.call(t, d)) {
				break;
			}
		}
		this.endUpdate();
	},
	updateAll: function(f, t) {
		this.beginUpdate();
		for (d in this.all) {
			if (!f.call(t, d)) {
				break;
			}
		}
		this.endUpdate();
	},
	
	top: function() {
		try {
			this.beginUpdate();
			var ids = this._getSelectedIds(true);
			ids.forEach(
				function(id, idx) {
					id = id + idx;
					this._downloads.unshift(this._downloads.splice(id, 1)[0]);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			this.selection.rangedSelect(0, ids.length - 1, true);			
		}
		catch (ex) {
			Debug.dump("Mover::top", ex);
		}	
	},
	bottom: function() {
		try {
			this.beginUpdate();
			var ids = this._getSelectedIds();
			ids.forEach(
				function(id, idx) {
					id = id - idx;
					this._downloads.push(this._downloads.splice(id, 1)[0]);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			this.selection.rangedSelect(this._downloads.length - ids.length, this._downloads.length - 1, true);			
		}
		catch (ex) {
			Debug.dump("Mover::bottom", ex);
		}	
	},
	up: function() {
		try {
			this.beginUpdate();
			var ids = this._getSelectedIds();
			ids.forEach(
				function(id, idx) {
					if (id - idx != 0) {
						var tmp = this._downloads[id];
						this._downloads[id] = this._downloads[id - 1];
						this._downloads[id - 1] = tmp;
						--id;
					}
					tree.selection.rangedSelect(id, id, true);						
				},
				this
			);
			this.endUpdate();
			this.invalidate();
		}
		catch (ex) {
			Debug.dump("Mover::up", ex);
		}		
	},
	down: function() {
		try {
			this.beginUpdate();
			var rowCount = this.rowCount;
			var ids = this._getSelectedIds(true);
			ids.forEach(
				function(id, idx) {
					if (id + idx != rowCount - 1) {
						var tmp = this._downloads[id];
						this._downloads[id] = this._downloads[id + 1];
						this._downloads[id + 1] = tmp;
						++id;
					}
					this.selection.rangedSelect(id , id, true);
				},
				this
			);
			this.endUpdate();
			this.invalidate();
			// readjust view
			var last = ids[0];
			if (last != this.rowCount - 1) {
				++last;
			}
			this._box.ensureRowIsVisible(last);
		}
		catch (ex) {
			Debug.dump("Mover::down", ex);
		}		
	}
};