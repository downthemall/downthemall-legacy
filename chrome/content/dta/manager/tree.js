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

XPCOMUtils.defineLazyGetter(this, "ImportExport", function() require("manager/imex"));

function FileDataProvider(download, file) {
	this._download = download;
	this._file = file;
};
FileDataProvider.prototype = {
	_checks: 0,
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIFlavorDataProvider]),
	get file() {
		if (this._timer) {
			Timers.killTimer(this._timer);
			delete this._timer;
		}
		this._checks = 0;
		this._timer = Timers.createOneshot(500, this.checkFile.bind(this));
		return this._file;
	},
	checkFile: function() {
		delete this._timer;
		if (!this._file.exists()) {
			Tree.remove(this._download);
			return;
		}
		if (++this._checks < 10) {
			this._timer = Timers.createOneshot(5000, this.checkFile.bind(this));
		}
	},
	getFlavorData: function(dataTransfer, flavor, data, dataLen) {
		data.value = this.file;
		dataLen.value = 1;
	}
};


const Tree = {
	init: function T_init(elem) {
		this.elem = elem;
		this._downloads = [];
		this._filtered = this._downloads;
		this._speedLimitList = $('perDownloadSpeedLimitList');
		this._matcher = new this.Matcher();

		addEventListener('blur', function() Tree.stopTip(), false);

		let tp = this;
		this.elem.addEventListener('dblclick', function() FileHandling.openFile(), false);
		this.elem.addEventListener('select', function() tp.selectionChanged(), false);
		this.elem.addEventListener('click', function(evt) { if (evt.button == 1) tp.showInfo(); }, false);

		let dtree = $('downloadList');
		dtree.addEventListener('dragstart', function(event) tp.onDragStart(event), false);

		$("matcher").addEventListener("command", function(event) tp.handleMatcherPopup(event), true);

		let mirrorNodes = $('mirrors', 'mirrors-sep');
		let mirrorCNodes = $('mirrors-cascaded', 'mirrors-cascaded-sep');
		$('popup').addEventListener('popupshowing', function onPopupShowing(event) {
			let current = tp.current;
			let cascadeMirrors = !current || current.urlManager.length < 2;
			for (let e of mirrorNodes) {
				e.hidden = cascadeMirrors;
			}
			for (let e of mirrorCNodes) {
				e.hidden = !cascadeMirrors;
			}
			tp.showSpeedLimitList(event);
		}, true);
		$('search').addEventListener('search', function(event) tp.setFilter(event.target.value), true);

		this.elem.treeBoxObject.view = this;
		this.assembleMenus();
		this._refreshTools_init();
		this.refreshTools();
	},
	unlink: function() {
		this.elem.view = null;
		delete this.elem;
	},
	assembleMenus: function() {
		for (let popup of $('removeCompletedPopup', 'removePopup')) {
			while (popup.lastChild) {
				if (popup.lastChild.localName == 'menuseparator') {
					break;
				}
				popup.removeChild(popup.lastChild);
			}
			let id = popup.id;
			for (let f in FilterManager.enumAll()) {
				if (f.id == 'deffilter-all') {
					continue;
				}
				let filter = f; // clone for closure
				let mi = document.createElementNS(popup.namespaceURI, 'menuitem');
				mi.setAttribute('label', filter.label);
				if (filter.iconExt) {
					mi.setAttribute('class', 'menuitem-iconic');
					mi.style.listStyleImage = "url(" + getIcon("file." + filter.iconExt) + ")";
					mi.style.MozImageRegion = 'auto';
				}
				else {
					mi.setAttribute('class', 'menuitem-iconic menuitem-filter');
				}
				mi.addEventListener('command', function() Tree.removeByFilter(filter, id), true);
				popup.appendChild(mi);
			}
		}
	},
	handleMatcherPopupshowing: function(col) {
		let processor = col.getAttribute('matcher');
		if (!processor) {
			return;
		}

		let popup = $("matcher");
		while (popup.firstChild && popup.firstChild.id != "matcher-fixed") {
			popup.removeChild(popup.firstChild);
		}
		let fixedItems = popup.firstChild;

		let active = (col.getAttribute('params') || "").split(",");
		let newActive = [];
		for (let i in this._matcher.getItems(processor, this._downloads)) {
			if (i.label == '-') {
				popup.insertBefore($e('menuseparator'), fixedItems);
				continue;
			}
			let checked = active.indexOf(i.param) >= 0;
			let attrs = {
				type: "checkbox",
				closemenu: "none",
				label: i.label,
				param: i.param,
				checked: checked
			};
			if (i.radio) {
				attrs.type = 'radio';
				attrs.name = popup.id + "_" + i.radio;
			}
			popup.insertBefore($e('menuitem', attrs), fixedItems);
			if (checked) {
				newActive.push(i.param);
			}
		}
		if (newActive.length) {
			col.setAttribute('params', newActive.join(','));
		}
		else {
			col.removeAttribute('params');
		}
		popup.col = col;
		popup.openPopup(col, "after_start", -1, -1, true, false, null);
	},
	handleMatcherPopup: function(event) {
		let target = event.target;
		let popup = target.parentNode;
		let element = popup.col;
		let matcher = element.getAttribute('matcher');
		let action = target.getAttribute('action');

		if (action == 'clearmatcher') {
			element.removeAttribute('params');
			for (let n of $$('menuitem[param]', popup)) {
				n.removeAttribute('checked')
			}
			this._matcher.removeMatcher(matcher);
			this.doFilter();
			return;
		}
		if (action == 'invertmatcher') {
			let active = [];
			let params = element.getAttribute('params');
			if (params) {
				active = params.split(',');
			}
			let newActive = mapFilterInSitu(
				$$('menuitem[type="checkbox"][param]', popup),
				function(e) {
					if (e.getAttribute('checked') == "true") {
						e.removeAttribute('checked');
					}
					else {
						e.setAttribute('checked', 'true');
					}
					return e.getAttribute('param');
				},
				function(e) active.indexOf(e) == -1
			);
			active = newActive;
			active.sort();
			let newParams = active.join(',');
			if (active.length) {
				element.setAttribute('params', newParams);
				if (newParams != params) {
					this._matcher.addMatcher(matcher, active);
					this.doFilter();
				}
			}
			else {
				element.removeAttribute('params');
				if (newParams != params) {
					this._matcher.removeMatcher(matcher);
					this.doFilter();
				}
			}
			return;
		}
		if (action == 'sortAscending') {
			this.sort(element.id, false);
			return;
		}
		if (action == 'sortDescending') {
			this.sort(element.id, true);
			return;
		}
		if (target.hasAttribute('param')) {
			let active = [];
			let params = element.getAttribute('params');
			if (params) {
				active = params.split(',');
			}
			let param = target.getAttribute('param');

			// remove other radio params for this name
			if (target.getAttribute('type') == 'radio') {
				// find other params for name
				let others = mapFilterInSitu(
					$$('menuitem[name="' + target.getAttribute('name') + '"]', popup),
					function(n) n.getAttribute('param'),
					function(p) p != param
					);
				// filter out other params
				filterInSitu(active, function(p) others.indexOf(p) < 0);
			}
			let idx = active.indexOf(param);
			if (idx === -1) {
				active.push(param);
			}
			else {
				active.splice(idx, 1);
			}
			filterInSitu(active, function(e) !((e in this) || (this[e] = null)), {});
			active.sort();
			let newParams = active.join(',');
			if (active.length) {
				element.setAttribute('params', newParams);
				if (newParams != params) {
					this._matcher.addMatcher(matcher, active);
					this.doFilter();
				}
			}
			else {
				element.removeAttribute('params');
				if (newParams != params) {
					this._matcher.removeMatcher(matcher);
					this.doFilter();
				}
			}
			return;
		}
	},
	clear: function() {
		log(LOG_INFO, "Tree: clearing");
		this.beginUpdate();
		delete this._downloads;
		delete this._filtered;
		this._downloads = [];
		this._filtered = this._downloads;
		$('search').clear();
		this.elem.view = this;
		this.endUpdate();
	},

	get downloadCount() {
		return this._downloads.length;
	},
	get rowCount() {
		return this._filtered.length;
	},
	setTree: function T_setTree(box) {
		if (!box) {
			return;
		}
		this._box = box;
		this._cols = [];
		for (let i = 0; i < box.columns.count; ++i) {
			this._cols.push(box.columns.getColumnAt(i));
		}
	},
	sort: function(id, descending) {
		if (Prompts.confirm(
			window,
			_('sortqueuetitle'),
			_('sortqueuemsg'),
			_('sortqueue'),
			_('cancel')
		)) {
			return;
		}

		let cmpFun = (function () {
			switch (id) {
			case 'task':
				if (Prefs.showOnlyFilenames) {
					return function(d) d.destinationName;
				}
				return function(d) d.urlManager.usable;
			case 'dim':
				return function(d) d.totalSize;
			case 'status':
				return function(d) d.status;
			case 'path':
				return function(d) d.destinationPath;
			case 'domain':
				return function(d) d.urlManager.domain;
			};
			throw new Exception("cmpFun not implemented");
		})();
		this.beginUpdate();
		try {
			Utils.naturalSort(this._downloads, cmpFun);
			if (descending) {
				this._downloads.reverse();
			}
			this.doFilter();
		}
		finally {
			this.invalidate();
			this.endUpdate();
			this.fireChangeEvent();
		}
	},
	_filter: '',
	_mustFilter: false,
	get filtered() this._matcher.filtering,
	doFilter: function T__doFilter() {
		if (this._updating) {
			this._mustFilter = true;
			return;
		}
		this.beginUpdate();
		try {
			// save selection
			let selectedIds = this._getSelectedFilteredIds();
			for (let i = 0, e = this._downloads.length; i < e; ++i) {
				this._downloads[i].filteredPosition = -1;
			}
			this._box.rowCountChanged(0, -this.rowCount);
			if (this._matcher.filtering) {
				this._filtered = this._matcher.filter(this._downloads);
			}
			else {
				this._filtered = this._downloads;
			}
			for (let i = 0, e = this._filtered.length; i < e; ++i) {
				this._filtered[i].filteredPosition = i;
			}
			this._box.rowCountChanged(0, this.rowCount);

			// restore selection
			// (with range merging)
			for (let i = 0; i < selectedIds.length; i++) {
				let fid = this._downloads[selectedIds[i]].filteredPosition;
				if (fid < 0) {
					continue;
				}
				let eid = fid;
				for (let e = i + 1; e < selectedIds.length; e++) {
					let oid = this._downloads[selectedIds[e]].filteredPosition;
					if (oid != eid + 1) {
						break;
					}
					eid = oid;
					i++;
				}
				this.selection.rangedSelect(fid, eid, true);
			}
		}
		finally {
			this.endUpdate();
		}
	},
	setFilter: function T_setFilter(nv) {
		if (nv == this._filter) {
			return;
		}
		this._filter = nv;
		if (!!nv) {
			this._matcher.addMatcher('textmatch', [this._filter]);
		}
		else {
			this._matcher.removeMatcher('textmatch');
		}
		// apply filters
		this.doFilter();
	},
	getParentIndex: function T_getParentIndex(idx) {
		// no parents, as we are actually a list
		return -1;
	},
	getLevel: function T_getLevel(idx) {
		// ... and being a list all nodes are on the same level
		return 0;
	},
	getCellText: function T_getCellText(idx, col) {
		const d = this._filtered[idx];
		if (!d) {
			return '';
		}

		switch (col.index) {
			case 0:  return Prefs.showOnlyFilenames ? d.destinationName : d.urlManager.usable;
			case 1:  return d.urlManager.domain;
			case 3:  return d.percent;
			case 4:  return d.dimensionString;
			case 5:  return d.status;
			case 6:  return d.speed;
			case 7:  return d.parts;
			case 8:  return d.mask;
			case 9:  return d.destinationPath;
			case 10: return d.prettyHash;
		}
		return '';
	},
	isSorted: function T_isSorted() true,
	isContainer: function T_isContainer(idx) false,
	isContainerOpen: function T_isContainerOpen(idx) false,
	isContainerEmpty: function T_isContainerEmpty(idx) false,
	isSeparator: function T_isSeparator(idx) false,
	isEditable: function T_isEditable(idx) true,

	// will grab the "icon" for a cell.
	getImageSrc: function T_getImageSrc(idx, col) {},
	getProgressMode : function T_getProgressMode(idx, col) {
		if (col.index == 2) {
			const d = this._filtered[idx];
			if (!d) {
				return 2;
			}
			const state = d.state;
			if (state == PAUSED && (!d.totalSize || d.progress < 5)) {
				return 2; // PROGRESS_UNDETERMINED;
			}
			if (state == RUNNING && !d.totalSize) {
				return 2; // PROGRESS_UNDETERMINED;
			}
			return 1; // PROGRESS_NORMAL;
		}
		return 3; // PROGRESS_NONE;
	},
	// will be called for cells other than textcells
	getCellValue: function T_getCellValue(idx, col) {
		if (col.index == 2) {
			const d = this._filtered[idx];
			if (!d) {
				return 0;
			}
			if (d.isOf(CANCELED | COMPLETE)) {
				return 100;
			}
			return d.progress || 0;
		}
		return null;
	},
	getCellProperties: function T_getCellProperties(idx, col, prop) {
		const cidx = col.index;
		if (cidx == 2) {
			prop.AppendElement(this.iconicAtom);
			prop.AppendElement(this.progressAtom);
			const d = this._filtered[idx];
			if (!d) {
				return;
			}
			switch (d.state) {
				case QUEUED:
					return;
				case COMPLETE:
					prop.AppendElement(this.completedAtom);
					if (d.hashCollection) {
						prop.AppendElement(this.verifiedAtom);
					}
				return;
				case PAUSED:
					prop.AppendElement(this.pausedAtom);
					if (!d.totalSize || d.progress < 5) {
						prop.AppendElement(this.pausedUndeterminedAtom);
					}
					if (d.autoRetrying) {
						prop.AppendElement(this.pausedAutoretryingAtom);
					}
				return;
				case FINISHING:
				case RUNNING:
					prop.AppendElement(this.inprogressAtom);
					return;
				case CANCELED:
					prop.AppendElement(this.canceledAtom);
					return;
			}
		}
		else if (cidx == 0) {
			let d = this._filtered[idx];
			prop.AppendElement(this.iconicAtom);
			prop.AppendElement(d.iconAtom);
			if (d.isPrivate) {
				prop.AppendElement(this.privateAtom);
			}
		}
	},
	cycleHeader: function T_cycleHeader(col) {
		if (!col.element.hasAttribute("matcher")) {
			return;
		}
		this.handleMatcherPopupshowing(col.element);
	},
	// just some stubs we need to provide anyway to implement a full nsITreeView
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getColumnProperties: function(column, element, prop) {},
	getRowProperties: function(idx, prop) {},
	setCellValue: function(idx, col, value) {},

	_changeTimer: null,
	selectionChanged: function T_selectionChanged() {
		if (this._changeTimer) {
			Timers.killTimer(this._changeTimer);
		}
		this._changeTimer = Timers.createOneshot(100, function() {
			this._changeTimer = null;
			this.refreshTools()
		}, this);
	},

	onDragStart: function T_onDragStart(event) {
		let transfer = event.dataTransfer;
		let i = 0;
		transfer.effectAllowed = "copymove";
		for (let qi in this.selected) {
			try {
				if (qi.state == COMPLETE) {
					let file = new Instances.LocalFile(qi.destinationFile);
					if (file.exists()) {
						transfer.mozSetDataAt("application/x-moz-file", new FileDataProvider(qi, file), i++);
					}
				}
				transfer.setData("application/x-dta-position", qi.position); i++;
			}
			catch (ex) {
				log(LOG_ERROR, "dnd failure", ex);
			}
			return;
		}
	},
	canDrop: function T_canDrop(index, orient, dt) {
		let rv = dt.types.contains("application/x-dta-position");
		if (rv) {
			dt.dropEffect = "move";
		}
		return rv;
	},
	drop: function T_drop(row, orient, dt) {
		log(LOG_DEBUG, "drop");
		if (!this.canDrop(row, orient, dt)) {
			return;
		}
		try {
			this.beginUpdate();
			let downloads;
			try {
				// means insert_after, so we need to adjust the row
				if (orient == 1) {
					++row;
				}
				// translate row from filtered list to full list
				let realRow = this._filtered[row].position;

				/* first we remove the dragged items from the list
				 * then we reinsert them
				 * if the dragged item is location before the drop position we need to adjust it (as we remove the item first)
				 * after we collected all items we simply reinsert them and invalidate our list.
				 * This might not be the most performant way, but at least it kinda works ;)
				 */
				downloads = Array.map(
					this._getSelectedIds(true),
					function(id) {
						let qi = this._filtered[id];
						if (id < row) {
							--row;
						}
						this._downloads.splice(qi.position, 1);
						return qi;
					},
					this
				);
				for (let qi of downloads) {
					this._downloads.splice(realRow, 0, qi);
				}
				this.doFilter();
			}
			finally {
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(Math.max(row, 0));
			this.selection.rangedSelect(row, row + downloads.length - 1, true);
		}
		catch (ex) {
			log(LOG_ERROR, "_dropSelection", ex);
		}
	},

	_updating: 0,
	beginUpdate: function T_beginUpdate() {
		if (++this._updating == 1) {
			this._box.beginUpdateBatch();
		}
	},
	endUpdate: function T_endUpdate() {
		if (--this._updating == 0) {
			this._box.endUpdateBatch();
			this.refreshTools();
			if (this._mustFilter) {
				this._mustFilter = false;
				this.doFilter();
			}
			if (this._mustFireChangeEvent) {
				this._mustFireChangeEvent = false;
				this.fireChangeEvent();
			}
		}
	},
	fastLoad: function T_add(download) this._downloads.push(download) -1,
	add: function T_add(download) {
		let pos = this.fastLoad(download);
		if (this._matcher.shouldDisplay(download)) {
			this.doFilter();
		}
		this.fireChangeEvent();
		return pos;
	},
	scrollToNearest: function(download) {
		if (!download || download.position < 0) {
			// Cannot scroll to a deleted download
			return;
		}
		// find the first visible download
		for (let i = download.position; i < this._downloads.length; ++i) {
			let fp = this._downloads[i].filteredPosition;
			if (fp < 0) {
				continue;
			}

			let pageLength = this._box.getPageLength();
			if (this.rowCount - fp <= pageLength) {
				this._box.scrollToRow(this.rowCount - pageLength);
			}
			else {
				this._box.scrollToRow(fp);
			}
			return;
		}
		// nothing found; do not scroll
	},
	removeWithConfirmation: function T_removeWithConfirmation() {
		if (Prefs.confirmRemove) {
			let res = Prompts.confirm(window, _('removecaption'), _('removequestion'), Prompts.YES, Prompts.NO, null, 0, false, _('removecheck'));
			if (res.checked) {
				Preferences.setExt('confirmremove', false);
			}
			if (res.button) {
				return;
			}
		}
		this.remove(null, true);
	},
	removeAllWithConfirmation: function T_removeAllWithConfirmation() {
		let res = Prompts.confirm(window, _('removecaption'), _('removeallquestion'), Prompts.YES, Prompts.NO);
		if (res) {
			return;
		}
		this.remove(this._downloads.map(function(e) e), true);
	},
	removeHostWithConfirmation: function T_removeHostWithConfirmation() {
		let domain = this.current.urlManager.domain;
		let res = Prompts.confirm(window, _('removecaption'), _('removehostquestion', [domain]), Prompts.YES, Prompts.NO);
		if (res) {
			return;
		}
		this.remove(this._downloads.filter(function(e) e.urlManager.domain == domain, this), true);
	},
	removeByFilter: function T_removeByFilter(filter, id) {
		let pref = null;
		let mask = -1;
		let msg = null;
		switch (id) {
		case 'removePopup':
			pref = 'confirmremove.' + filter.id;
			msg = 'removefilterquestion';
			mask = COMPLETE | QUEUED | CANCELED | PAUSED;
			break;
		case 'removeCompletedPopup':
			pref = 'confirmremovecompleted.' + filter.id;
			msg = 'removecompletedfilterquestion';
			mask = COMPLETE;
			break;
		default:
			throw new Exception("Invalid access");
		}

		if (Preferences.getExt(pref, true)) {
			let res = Prompts.confirm(
				window,
				_('removecaption'),
				_(msg, [filter.label]),
				Prompts.YES, Prompts.NO,
				null, 0, false, _('removecheck'));
			if (res.checked) {
				Preferences.setExt(pref, false);
			}
			if (res.button) {
				return;
			}
		}

		let downloads = [];
		for (let d of this.all) {
			if (!(d.state & mask)) {
				continue;
			}
			if (!filter.match(d.urlManager.url) && !filter.match(d.destinationName)) {
				continue;
			}
			downloads.push(d);
		}
		if (downloads.length) {
			Tree.remove(downloads);
		}
	},
	_mustFireChangeEvent: false,
	fireChangeEvent: function() {
		if (this._updating) {
			this._mustFireChangeEvent = true;
			return;
		}
		let evt = document.createEvent("UIEvents");
		evt.initUIEvent("change", true, true, null, 0);
		return this.elem.dispatchEvent(evt);
	},
	remove: function T_remove(downloads, performJump) {
		if (downloads && !(downloads instanceof Array)) {
			downloads = [downloads];
		}
		else if (!downloads) {
			downloads = this.getSelected();
		}
		if (!downloads.length) {
			return;
		}

		downloads = downloads.sort(function(a, b) b.position - a.position);
		let last = 0;

		this.beginUpdate();
		try {
			let async = downloads.length < 100;
			for (let i = 0; i < downloads.length; ++i) {
				let d = downloads[i];
				if (d.state == FINISHING) {
					// un-removable :p
					return;
				}
				// wipe out any info/tmpFiles
				if (!d.isOf(COMPLETE | CANCELED)) {
					d.deleting = true;
					d.cancel();
				}
				this._downloads.splice(d.position, 1);
				this._box.rowCountChanged(d.position, -1);
				last = Math.max(d.filteredPosition, last);
				if (async) {
					d.remove();
				}
				if (!d.isOf(RUNNING | PAUSED)) {
					Dialog.wasRemoved(d);
				}
			}
			if (!async) {
				QueueStore.syncDeleteDownloads(downloads);
			}
		}
		finally {
			this.invalidate();
			this.doFilter();
			this.endUpdate();
			this.fireChangeEvent();
		}
		if (performJump) {
			this._removeJump(filterInSitu(downloads, function(e) e.filteredPosition >= 0).length, last);
		}
	},
	_removeCompleted: function T__removeCompleted(onlyGone) {
		this.beginUpdate();
		try {
			QueueStore.beginUpdate();
			let delta = this._downloads.length, last = 0;
			for (let i = delta - 1; i > -1; --i) {
				let d = this._downloads[i];
				if (d.state != COMPLETE) {
					continue;
				}
				if (onlyGone && (new Instances.LocalFile(d.destinationFile).exists())) {
					continue;
				}
				this._downloads.splice(d.position, 1);
				this._box.rowCountChanged(d.position, -1);
				last = Math.max(d.position, last);
				d.remove();
			}
			QueueStore.endUpdate();
			if (delta != this._downloads.length) {
				this.doFilter();
			}
		}
		finally {
			this.invalidate();
			this.endUpdate();
		}
	},
	removeCompleted: function T_removeCompleted() {
		if (Prefs.confirmRemoveCompleted) {
			let res = Prompts.confirm(window, _('removecaption'), _('removecompletedquestion'), Prompts.YES, Prompts.NO, null, 0, false, _('removecheck'));
			if (res.checked) {
				Preferences.setExt('confirmremovecompleted', false);
			}
			if (res.button) {
				return;
			}
		}
		this._removeCompleted(false);
	},
	removeDupes: function() {
		let known = {};
		let dupes = [];
		for (let d of this.all) {
			let url = d.urlManager.url.spec;
			if (url in known) {
				if (d.isOf(COMPLETE | FINISHING)) {
					continue;
				}
				dupes.push(d);
			}
			else {
				known[url] = null;
			}
		}
		if (dupes.length) {
			this.remove(dupes);
			return true;
		}
		return false;
	},
	removeGone: function T_removeGone() {
		this._removeCompleted(true);
	},
	_removeJump: function(delta, last) {
		if (!this.rowCount) {
			this._box.ensureRowIsVisible(0);
		}
		else {
			let np = Math.max(0, Math.min(last - delta + 1, this.rowCount - 1));
			if (np < this._box.getFirstVisibleRow() || np > this._box.getLastVisibleRow()) {
				this._box.ensureRowIsVisible(np);
			}
			this.selection.currentIndex = np;
		}
	},
	_pause_item: function T_pause_item(d) {
		if (d.isOf(QUEUED | PAUSED) || (d.state == RUNNING && d.resumable)) {
			d.pause();
			d.clearAutoRetry();
			d.status = TextCache_PAUSED;
			d.setState(PAUSED);
		}
		return true;
	},
	pause: function T_pause() {
		this.updateSelected(this._pause_item);
	},
	_resume_item: function T_resumeItem(d) {
		if (d.isOf(PAUSED | CANCELED)) {
			d.liftLoginRestriction = true;
			d.queue();
		}
		return true;
	},
	resume: function T_resume(d) {
		this.updateSelected(this._resume_item);
	},
	_cancel_item: function T_cancel_item(d) d.cancel() || true,
	cancel: function T_cancel() {
		if (Prefs.confirmCancel) {
			let many = this.selection.count > 1;
			let res = Prompts.confirm(
					window,
					_('canceltitle'),
					_(many ? 'cancelmanytext' : 'canceltext' ),
					_(many ? 'docancelmany' : 'docancel'),
					_('dontcancel'),
					null, 1, false, _('removecheck'));
			if (res.checked) {
				Preferences.setExt('confirmcancel', false);
			}
			if (res.button) {
				return;
			}
		}
		this.updateSelected(this._cancel_item);
	},
	selectAll: function T_selectAll() {
		this.selection.selectAll();
		this.selectionChanged();
	},
	selectInv: function T_selectInv() {
		for (let d of this.all) {
			this.selection.toggleSelect(d.position);
		}
		this.selectionChanged();
	},
	_changeChunks_inc: function T_changeChunks_inc(d) {
		if (d.maxChunks < 10 && d.resumable) {
			++d.maxChunks;
		}
		return true;
	},
	_changeChunks_dec: function T_changeChunks_dec(d) {
		if (d.maxChunks > 1) {
			--d.maxChunks;
		}
		return true;
	},
	changeChunks: function T_changeChunks(increase) {
		Tree.updateSelected(increase
			? this._changeChunks_inc
			: this._changeChunks_dec
			);
	},
	force: function T_force() {
		for (let d in Tree.selected) {
			if (d.isOf(QUEUED | PAUSED | CANCELED)) {
				d.queue();
				Dialog.run(d, true);
			}
		}
	},
	manageMirrors: function T_manageMirrors() {
		if (!this.current) {
			return;
		}
		let mirrors = this.current.urlManager.toArray();
		openDialog(
			'chrome://dta/content/dta/mirrors.xul',
			null,
			"chrome,dialog,resizable,modal,centerscreen",
			mirrors
		);
		if (mirrors.length) {
			this.current.replaceMirrors(mirrors);
			log(LOG_INFO, "New mirrors set " + mirrors);
		}
	},
	export: function T_export() {
		function processResponse(fp, rv) {
			if (rv != Ci.nsIFilePicker.returnOK && rv != Ci.nsIFilePicker.returnReplace) {
				return;
			}
			try {
				let fs = fp.file;
				if (!(/\.[\d\w-]{1,4}/.test(fs.leafName)) && fp.filterIndex != 4) {
					if (fp.filterIndex == 0) {
						fs.leafName += ".html";
					}
					else if (fp.filterIndex == 2) {
						fs.leafName += ".metalink"
					}
					else if(fp.filterIndex == 3) {
						fs.leafName += ".meta4";
					}
					else {
						fs.leafName += ".txt";
					}
				}
				if (/\.x?html$/i.test(fs.leafName) || fp.filterIndex == 0) {
					ImportExport.exportToHtmlFile(this.selected, document, fs, Prefs.permissions);
				}
				else if (/\.metalink$/i.test(fs.leafName) || fp.filterIndex == 2) {
					ImportExport.exportToMetalinkFile(this.selected, document, fs, Prefs.permissions);
				}
				else if(/\.meta4$/i.test(fs.leafName) || fp.filterIndex == 3) {
					ImportExport.exportToMetalink4File(this.selected, document, fs, Prefs.permissions);
				}
				else {
					ImportExport.exportToTextFile(this.selected, fs, Prefs.permissions);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "Cannot export downloads (process response)", ex);
				Prompts.alert(window, _('exporttitle'), _('exportfailed'));
			}
		}
		try {
			let fp = new Instances.FilePicker(window, _('exporttitle'), Ci.nsIFilePicker.modeSave);
			fp.appendFilters(Ci.nsIFilePicker.filterHTML);
			fp.appendFilters(Ci.nsIFilePicker.filterText);
			fp.appendFilter(_('filtermetalink3'), '*.metalink');
			fp.appendFilter(_('filtermetalink'), "*.meta4");
			fp.appendFilters(Ci.nsIFilePicker.filterAll);
			fp.defaultString = "Downloads.meta4";
			fp.filterIndex = 3;

			if ("open" in fp) {
				fp.open({done: processResponse.bind(this, fp)});
			}
			else {
				processResponse.call(this, fp, fp.show());
			}
		}
		catch (ex) {
			log(LOG_ERROR, "Cannot export downloads", ex);
			Prompts.alert(window, _('exporttitle'), _('exportfailed'));
		}
	},
	import: function T_import() {
		function processResponse(fp, rv) {
			if (rv != Ci.nsIFilePicker.returnOK) {
				return;
			}
			try {
				if (/\.(xml|meta(4|link))$/i.test(fp.file.leafName)) {
					Metalinker.handleFile(fp.file);
					return;
				}
				let links = ImportExport.parseTextFile(fp.file);
				if (links.length) {
					DTA.saveLinkArray(window, links, []);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "Cannot import downloads (processResponse)", ex);
				Prompts.alert(window, _('importtitle'), _('importfailed'));
			}
		}
		try {
			let fp = new Instances.FilePicker(window, _('importtitle'), Ci.nsIFilePicker.modeOpen);
			fp.appendFilters(Ci.nsIFilePicker.filterText);
			fp.appendFilter(_('filtermetalink'), '*.meta4');
			fp.appendFilter(_('filtermetalink3'), '*.metalink');
			fp.defaultExtension = "meta4";
			fp.filterIndex = 1;

			if ("open" in fp) {
				fp.open({done: processResponse.bind(this, fp)});
			}
			else {
				processResponse.call(this, fp, fp.show());
			}
		}
		catch (ex) {
			log(LOG_ERROR, "Cannot import downloads", ex);
			Prompts.alert(window, _('importtitle'), _('importfailed'));
		}
	},
	addLimits: function T_addLimits() {
		DTA.showPreferences(
			"paneServers",
			{
				action: "addlimits",
				url: this.current.urlManager.url.spec
			}
		);
	},
	showInfo: function T_showInfo() {
		this.beginUpdate();
		try {
			let downloads = [];
			for (let d in Tree.selected) {
				downloads.push(d);
			}
			if (downloads.length) {
				Dialog.openInfo(downloads);
			}
		}
		finally {
			this.endUpdate();
		}
	},
	showTip: function(event) {
		if (!Prefs.showTooltip || Services.ww.activeWindow != window) {
			return false;
		}
		let row = {};
		this._box.getCellAt(event.clientX, event.clientY, row, {}, {});
		if (row.value == -1) {
			return false;
		}
		let d = this.at(row.value);
		if (!d) {
			return false;
		}
		$("infoIcon").src = d.largeIcon;
		$("infoURL").value = d.urlManager.url.spec;
		$("infoDest").value = d.destinationFile;
		$("infoDate").value = d.startDate.toLocaleString();
		$("infoPrivate").hidden = !d.isPrivate;

		Tooltip.start(d, true);
		return true;
	},
	stopTip: function T_stopTip() {
		Tooltip.stop();
	},
	_refreshTools_item: [
		{item: 'cmdResume', f: function(d) d.isOf(PAUSED | QUEUED | CANCELED)},
		{item: 'cmdPause', f: function(d) (d.isOf(RUNNING) && d.resumable) || d.isOf(QUEUED | PAUSED)},
		{item: 'cmdCancel', f: function(d) d.isOf(PAUSED | RUNNING | QUEUED | COMPLETE)},

		{item: 'cmdLaunch', f: function(d) !!d.curFile},
		{item: 'cmdOpenFolder', f: function(d) !!d.curFolder},
		{item: 'cmdDelete', f: function(d) d.state == COMPLETE}
	],
	_refreshTools_items: [
		{items: ['cmdRemoveSelected', 'cmdExport', 'cmdGetInfo', 'perDownloadSpeedLimit'], f: function(d) !!d.count},
		{items: ['cmdMirrors', 'cmdAddLimits'], f: function(d) d.count == 1},
		{items: ['cmdAddChunk', 'cmdRemoveChunk', 'cmdForceStart'], f: function(d) d.isOf(QUEUED | RUNNING | PAUSED | CANCELED)},
		{items: ['cmdMoveTop', 'cmdMoveUp'], f: function(d) d.min > 0},
		{items: ['cmdMoveDown', 'cmdMoveBottom'], f: function(d) d.max != d.rows - 1}
	],
	_refreshTools_init: function() {
		this._refreshTools_item.forEach(function(e) e.item = $(e.item));
		this._refreshTools_items.forEach(function(e) e.items = $.apply(null, e.items));
	},
	refreshTools: function T_refreshTools(d) {
		if (this._updating || (d && ('position' in d) && !this.selection.isSelected(d.position))) {
			return;
		}
		try {
			let empty = this.current == null;
			if (empty) {
				for (let i = 0, e = this._refreshTools_item.length; i < e; ++i) {
					this._refreshTools_item[i].item.setAttribute("disabled", "true");
				}
				for (let i = 0, e = this._refreshTools_items.length; i < e; ++i) {
					let items = this._refreshTools_items[i].items;
					for (let ii = 0, ee = items.length; ii < ee; ++ii) {
						items[ii].setAttribute("disabled", "true");
					}
				}
				return;
			}

			let states = {
				state: 0,
				resumable: false,
				is: function(s) this.state & s,
				isOf: QueueItem.prototype.isOf,
				count: this.selection.count,
				rows: this.rowCount,
				min: this.rowCount,
				max: 0
			};
			for (let d in this.selected) {
				states.state |= d.state;
				states.resumable |= d.resumable;
				states.min = Math.min(d.filteredPosition, states.min);
				states.max = Math.max(d.filteredPosition, states.max);
			}
			let cur = this.current;
			states.curFile = (cur && cur.state == COMPLETE && (new Instances.LocalFile(cur.destinationFile)).exists());
			states.curFolder = (cur && (new Instances.LocalFile(cur.destinationPath)).exists());

			for (let i = 0, e = this._refreshTools_item.length; i < e; ++i) {
				let item = this._refreshTools_item[i];
				item.item.setAttribute("disabled", item.f(states) ? "false" : "true");
			}
			for (let i = 0, e = this._refreshTools_items.length; i < e; ++i) {
				let items = this._refreshTools_items[i];
				let disabled = items.f(states) ? "false" : "true";
				items = items.items;
				for (let ii = 0, ee = items.length; ii < ee; ++ii) {
					items[ii].setAttribute("disabled", disabled);
				}
			}
		}
		catch (ex) {
			log(LOG_ERROR, "rt", ex);
		}
	},
	_invalidate_all: function(e, i) {
		if (e.position != i) {
			e.position = i;
			this.push({dbId: e.dbId, position: i});
		}
		if (e.state == COMPLETE) {
			Dialog.completed++;
		}
	},
	invalidate: function T_invalidate(d, cell) {
		if (!d) {
			let saveArray = [];
			Dialog.completed = 0;
			this._downloads.forEach(this._invalidate_all, saveArray);
			if (saveArray.length) {
				QueueStore.asyncSavePosition(saveArray);
				this.fireChangeEvent();
			}
			this._box.invalidate();
			this.refreshTools(this);
			return;
		}

		if (d instanceof Array) {
			this.beginUpdate();
			try {
				this._box.invalidateRange(d[0].filteredPosition, d[d.length - 1].filteredPosition);
			}
			finally {
				if (this._matcher.filter(d).length != d.filter(function(e) e.filteredPosition > -1).length) {
					this.doFilter();
				}
				this.endUpdate();
			}
			return;
		}

		if (d.position >= 0) {
			if (cell !== undefined) {
				this._box.invalidateCell(d.filteredPosition, this._cols[cell]);
			}
			else {
				this._box.invalidateRow(d.filteredPosition);
			}
			if (this._matcher.shouldDisplay(d) == (d.filteredPosition < 0)) {
				this.doFilter();
			}
		}
	},
	get box() {
		return this._box;
	},
	get all() this._downloads,

	// generator for selected download elements.
	// do not make any assumptions about the order.
	get selected() {
		if (!this.selection.count) {
			return;
		}

		// loop through the selection as usual
		for (let i = 0, e = this.selection.getRangeCount(); i < e; ++i) {
			let start = {}, end = {value: -1};
			this.selection.getRangeAt(i, start, end);
			for (let j = start.value, k = end.value; j <= k; ++j) {
					let d = this._filtered[j];
					if (d) {
						yield d;
					}
			}
		}
	},
	getSelected: function() {
		if (!this.selection.count) {
			return [];
		}
		let rv = new Array(this.selection.count);
		// loop through the selection as usual
		for (let i = 0, e = this.selection.getRangeCount(), idx = 0; i < e; ++i) {
			let start = {}, end = {value: -1};
			this.selection.getRangeAt(i, start, end);
			for (let j = start.value, k = end.value; j <= k; ++j) {
				rv[idx++] = this._filtered[j];
			}
		}
		this.selection.clearSelection();
		return rv;
	},

	// returns an ASC sorted array of IDs that are currently selected.
	_getSelectedIds: function T_getSelectedIds(getReversed) {
		let select = this.selection;
		if (!select.count) {
			return [];
		}
		let rv = new Uint32Array(select.count);
		// loop through the selection as usual
		for (let i = 0, e = select.getRangeCount(), idx = 0; i < e; ++i) {
				let start = {}, end = {};
				this.selection.getRangeAt(i, start, end);
				for (let j = start.value, k = end.value; j <= k; ++j) {
					rv[idx++] = j;
					//rv.push(j);
				}
		}
		this.selection.clearSelection();
		if (getReversed) {
			Array.sort(rv, this._getSelectedIds_desc);
		}
		else {
			Array.sort(rv, this._getSelectedIds_asc);
		}
		return rv;
	},
	_getSelectedIds_asc: function(a, b) a - b,
	_getSelectedIds_desc: function(a, b) b - a,
	_getSelectedFilteredIds_map: function(id) this._filtered[id].position,
	_getSelectedFilteredIds: function T_getSelectedFilteredIds(reverse)
		mapInSitu(this._getSelectedIds(reverse), this._getSelectedFilteredIds_map, this),

	// get the first selected item, NOT the item which has the input focus.
	get current() {
		let select = this.selection;
		try {
			let ci = {value: -1};
			this.selection.getRangeAt(0, ci, {});
			if (ci.value > -1 && ci.value < this.rowCount) {
				return this._filtered[ci.value];
			}
		}
		catch (ex) {
			// fall-through
		}
		return null;
	},
	// get the currently focused item.
	get focused() {
		let ci = this.selection.currentIndex;
		if (ci > -1 && ci < this.rowCount) {
			return this._filtered[ci];
		}
		return null;
	},
	at: function T_at(idx) {
		return this._filtered[idx];
	},
	some: function T_some(f, t) {
		return this._downloads.some(f, t);
	},
	every: function T_every(f, t) {
		return this._downloads.every(f, t);
	},
	update: function T_update(f, t) {
		try {
			this.beginUpdate();
			try {
				f.call(t);
			}
			finally {
				this.endUpdate();
			}
		}
		catch (ex) {
			log(LOG_ERROR, "function threw during update", ex);
			throw ex;
		}
	},
	updateSelected: function T_updateSelected(f, t) {
		try {
			this.beginUpdate();
			try {
				QueueStore.beginUpdate();
				for (let d in this.selected) {
					if (!f.call(t, d)) {
						break;
					}
				}
				QueueStore.endUpdate();
			}
			finally {
				this.invalidate();
				this.endUpdate();
			}
		}
		catch (ex) {
			log(LOG_ERROR, "function threw during updateSelected", ex);
			throw ex;
		}
	},
	updateAll: function T_updateAll(f, t) {
		try {
			this.beginUpdate();
			try {
				QueueStore.beginUpdate();
				for (let d of this.all) {
					if (!f.call(t, d)) {
						break;
					}
				}
				QueueStore.endUpdate();
			}
			finally {
				this.endUpdate();
			}
		}
		catch (ex) {
			log(LOG_ERROR, "function threw during updateAll", ex);
			throw ex;
		}
	},
	moveTop: function T_top() {
		try {
			this.beginUpdate();
			let ids;
			try {
				ids = this._getSelectedFilteredIds(true);
				for (let [idx, id] in Iterator(ids)) {
					id = id + idx;
					this._downloads.unshift(this._downloads.splice(id, 1)[0]);
				}
				this.doFilter();
				this.selection.rangedSelect(0, ids.length - 1, true);
			}
			finally {
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(0);
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::top", ex);
		}
	},
	moveBottom: function T_bottom() {
		try {
			this.beginUpdate();
			let ids;
			try {
				ids = this._getSelectedFilteredIds();
				for (let [idx, id] in Iterator(ids)) {
					id = id - idx;
					this._downloads.push(this._downloads.splice(id, 1)[0]);
				}
				this.doFilter();
				this.selection.rangedSelect(this._filtered.length - ids.length, this._filtered.length - 1, true);
			}
			finally {
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(this.rowCount - 1);
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::bottom", ex);
		}
	},
	moveUp: function T_up() {
		try {
			if (this._matcher.filtering) {
				throw Error("not implemented");
			}
			this.beginUpdate();
			let ids;
			try {
				ids = mapInSitu(
					this._getSelectedFilteredIds(),
					function(id, idx) {
						if (id - idx != 0) {
							[this._downloads[id], this._downloads[id - 1]] = [this._downloads[id - 1], this._downloads[id]];
							--id;
						}
						this.selection.rangedSelect(id, id, true);
						return id;
					},
					this
				);
				this.doFilter();
			}
			finally {
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(Math.max(ids[0] - 1, 0));
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::up", ex);
		}
	},
	moveDown: function T_down() {
		try {
			if (this._matcher.filtering) {
				throw Error("not implemented");
			}
			this.beginUpdate();
			let ids;
			try {
				let rowCount = this.rowCount;
				ids = mapInSitu(
					this._getSelectedIds(true),
					function(id, idx) {
						if (id + idx != rowCount - 1) {
							let tmp = this._downloads[id];
							this._downloads[id] = this._downloads[id + 1];
							this._downloads[id + 1] = tmp;
							++id;
						}
						this.selection.rangedSelect(id , id, true);
						return id;
					},
					this
				);
				this.doFilter();
			}
			finally {
				this.invalidate();
				this.endUpdate();
			}
			// readjust view
			this._box.ensureRowIsVisible(Math.min(ids[0], this.rowCount - 1));
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::down", ex);
		}
	},
	showSpeedLimitList: function(event) {
		if (!this.selection.count) {
			return false;
		}
		let selection = this.selected;
		let limit = selection.next().speedLimit;
		for (let qi in selection) {
			if (limit != qi.speedLimit) {
				limit = -1;
			}
		}
		this._speedLimitList.limit = limit;
		return true;
	},
	_changePerDownloadSpeedLimit_item: function T_changePerDownloadSpeedLimit_item(limit, d) (
		(d.speedLimit = limit) || true
		),
	changePerDownloadSpeedLimit: function() {
		let limit = $('perDownloadSpeedLimitList').limit;
		this.updateSelected(this._changePerDownloadSpeedLimit_item.bind(null, limit));
	}
};
requireJoined(Tree, "manager/matcher");
requireJoined(Tree, "support/atoms");

const FileHandling = {
	get _uniqueList() {
		let u = {};
		for (d in Tree.selected) {
			if (d.state == COMPLETE) {
				let f = d.destinationFile;
				if (Utils.SYSTEMSLASH == "\\") {
					f = f.toLowerCase();
				}
				if (!(f in u)) {
					u[f] = null;
					yield d;
				}
			}
		}
	},
	openFolder: function() {
		for (d in Tree.selected) {
			try {
				if (new Instances.LocalFile(d.destinationPath).exists()) {
					Utils.reveal(d.destinationFile);
				}
			}
			catch (ex) {
				log(LOG_ERROR, 'reveal', ex);
			}
		}
	},
	openFile: function() {
		let cur = Tree.current;
		if (cur && cur.state == COMPLETE) {
			try {
				Utils.launch(cur.destinationFile);
			}
			catch (ex) {
				log(LOG_INFO, 'launch', ex);
			}
		}
	},
	deleteFile: function() {
		let list = [];

		for (d in this._uniqueList) {
			let file = new Instances.LocalFile(d.destinationFile);
			if (file.exists()) {
				list.push(d);
			}
		}
		let msg = '';
		if (list.length < 25) {
			msg = _('deletetexts');
			for (let d of list) {
				msg += "\n" + (new Instances.LocalFile(d.destinationFile)).leafName;
			}
		}
		else {
			msg = _('deletetextl', [list.length]);
		}
		if (list.length && Prompts.confirm(window, _('deletecaption'), msg, _('delete'), Prompts.CANCEL, null, 1)) {
			return;
		}
		for (let d of list) {
			try {
				let file = new Instances.LocalFile(d.destinationFile);
				if (file.exists()) {
					file.remove(false);
				}
			}
			catch (ex) {
				// no-op
			}
		}
		Tree.remove(null, true);
	}
};
