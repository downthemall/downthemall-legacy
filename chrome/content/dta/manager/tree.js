/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";
/* global $, $e, $$, _, Utils, FilterManager, getIcon, Preferences, OS */
/* global mapInSitu, filterInSitu, mapFilterInSitu, filterMapInSitu */
/* global DTA, Dialog,  QueueItem, Prefs, QueueStore, Prompts, ImportExport, Metalinker */
/* global asyncMoveFile, showPreferences, Tooltip, CoThreadListWalker */
/* global COMPLETE, CANCELED, RUNNING, PAUSED, QUEUED, FINISHING */
/* global TextCache_PAUSED */
/* global FileExts, setTimeoutOnlyFun */
/* jshint strict:true, globalstrict:true, browser:true, latedef:false */

XPCOMUtils.defineLazyGetter(window, "ImportExport", () => require("manager/imex"));

class FileDataProvider {
	constructor(tree, download, file) {
		this._tree = tree;
		this._download = download;
		this._file = file;
		this._checks = 0;
		this.QueryInterface = QI([Ci.nsIFlavorDataProvider]);
	}
	get file() {
		if (this._timer) {
			clearTimeout(this._timer);
			delete this._timer;
		}
		this._checks = 0;
		this._timer = setTimeoutOnlyFun(() => this.checkFile(), 500);
		return this._file;
	}
	async checkFile() {
		delete this._timer;
		let exists = await OS.File.exists(this._file.path);
		if (!exists) {
			this._tree.remove(this._download);
			return;
		}
		if (++this._checks < 10) {
			this._timer = setTimeoutOnlyFun(() => this.checkFile(), 5000);
		}
	}
	getFlavorData(dataTransfer, flavor, data, dataLen) {
		data.value = this.file;
		dataLen.value = 1;
	}
}


class TreeManager {
	constructor(elem) {
		this.elem = elem;
		this._downloads = [];
		this._updating = 0;
		this._filter = '';
		this._mustFilter = false;
		this._filtered = this._downloads;
		this._speedLimitList = $('perDownloadSpeedLimitList');
		this._matcher = new this.Matcher();

		addEventListener('blur', () => this.stopTip(), false);

		this.elem.addEventListener('select', () => this.selectionChanged(), false);
		this.elem.addEventListener('click', evt => {
			if (evt.button === 1) {
				this.showInfo();
			}
		}, false);

		let dtree = $('downloadList');
		dtree.addEventListener('dragstart', event => this.onDragStart(event), false);
		dtree.addEventListener('dblclick', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.openFile();
		}, false);

		$("matcher").addEventListener("command", event => this.handleMatcherPopup(event), true);

		let mirrorNodes = $('mirrors', 'mirrors-sep');
		let mirrorCNodes = $('mirrors-cascaded', 'mirrors-cascaded-sep');
		$('popup').addEventListener('popupshowing', event => {
			let current = this.current;
			let cascadeMirrors = !current || current.urlManager.length < 2;
			for (let e of mirrorNodes) {
				e.hidden = cascadeMirrors;
			}
			for (let e of mirrorCNodes) {
				e.hidden = !cascadeMirrors;
			}
			this.showSpeedLimitList(event);
		}, true);
		$('search').addEventListener('search', event => this.setFilter(event.target.value), true);

		this.elem.treeBoxObject.view = this;
		this.assembleMenus();
		this._refreshTools_init();
		this.refreshTools();
	}

	get downloadCount() {
		return this._downloads.length;
	}
	get rowCount() {
		return this._filtered.length;
	}
	get filtered() {
		return this._matcher.filtering;
	}
	get box() {
		return this._box;
	}
	get all() {
		return this._downloads;
	}
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
	}
	// get the currently focused item.
	get focused() {
		let ci = this.selection.currentIndex;
		if (ci > -1 && ci < this.rowCount) {
			return this._filtered[ci];
		}
		return null;
	}

	unlink() {
		this.elem.view = null;
		delete this.elem;
	}

	assembleMenus() {
		// jshint globalstrict:true, strict:true, loopfunc:true
		for (let popup of $('removeCompletedPopup', 'removePopup')) {
			while (popup.lastChild) {
				if (popup.lastChild.localName === 'menuseparator') {
					break;
				}
				popup.removeChild(popup.lastChild);
			}
			let id = popup.id;
			for (let f of FilterManager.enumAll()) {
				if (f.id === 'deffilter-all') {
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
				mi.addEventListener('command', () => this.removeByFilter(filter, id), true);
				popup.appendChild(mi);
			}
		}
	}

	handleMatcherPopupshowing(col) {
		let processor = col.getAttribute('matcher');
		if (!processor) {
			return;
		}

		let popup = $("matcher");
		while (popup.firstChild && popup.firstChild.id !== "matcher-fixed") {
			popup.removeChild(popup.firstChild);
		}
		let fixedItems = popup.firstChild;

		let active = (col.getAttribute('params') || "").split(",");
		let newActive = [];
		for (let i of this._matcher.getItems(processor, this._downloads)) {
			if (i.label === '-') {
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
	}

	handleMatcherPopup(event) {
		let target = event.target;
		let popup = target.parentNode;
		let element = popup.col;
		let matcher = element.getAttribute('matcher');
		let action = target.getAttribute('action');

		if (action === 'clearmatcher') {
			element.removeAttribute('params');
			for (let n of $$('menuitem[param]', popup)) {
				n.removeAttribute('checked');
			}
			this._matcher.removeMatcher(matcher);
			this.doFilter();
			return;
		}
		if (action === 'invertmatcher') {
			let active = [];
			let params = element.getAttribute('params');
			if (params) {
				active = params.split(',');
			}
			let newActive = mapFilterInSitu(
				$$('menuitem[type="checkbox"][param]', popup),
				function(e) {
					if (e.getAttribute('checked') === "true") {
						e.removeAttribute('checked');
					}
					else {
						e.setAttribute('checked', 'true');
					}
					return e.getAttribute('param');
				},
				e => !~active.indexOf(e)
			);
			active = newActive;
			active.sort();
			let newParams = active.join(',');
			if (active.length) {
				element.setAttribute('params', newParams);
				if (newParams !== params) {
					this._matcher.addMatcher(matcher, active);
					this.doFilter();
				}
			}
			else {
				element.removeAttribute('params');
				if (newParams !== params) {
					this._matcher.removeMatcher(matcher);
					this.doFilter();
				}
			}
			return;
		}
		if (action === 'sortAscending') {
			this.sort(element.id, false);
			return;
		}
		if (action === 'sortDescending') {
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
			if (target.getAttribute('type') === 'radio') {
				// find other params for name
				let others = mapFilterInSitu(
					$$('menuitem[name="' + target.getAttribute('name') + '"]', popup),
					n => n.getAttribute('param'),
					p => p !== param
					);
				// filter out other params
				filterInSitu(active, p => others.indexOf(p) < 0);
			}
			let idx = active.indexOf(param);
			if (idx === -1) {
				active.push(param);
			}
			else {
				active.splice(idx, 1);
			}
			filterInSitu(active, function(e) {
				return !((e in this) || (this[e] = null));
			}, {});
			active.sort();
			let newParams = active.join(',');
			if (active.length) {
				element.setAttribute('params', newParams);
				if (newParams !== params) {
					this._matcher.addMatcher(matcher, active);
					this.doFilter();
				}
			}
			else {
				element.removeAttribute('params');
				if (newParams !== params) {
					this._matcher.removeMatcher(matcher);
					this.doFilter();
				}
			}
			return;
		}
	}

	clear() {
		log(LOG_INFO, "Tree: clearing");
		this.beginUpdate();
		delete this._downloads;
		delete this._filtered;
		this._downloads = [];
		this._filtered = this._downloads;
		$('search').clear();
		this.elem.view = this;
		this.endUpdate();
	}

	setTree(box) {
		if (!box) {
			return;
		}
		this._box = box;
		this._cols = [];
		for (let i = 0; i < box.columns.count; ++i) {
			this._cols.push(box.columns.getColumnAt(i));
		}
	}

	sort(id, descending) {
		if (Prompts.confirm(
			window,
			_('sortqueue.title'),
			_('sortqueuemsg'),
			_('sortqueue'),
			_('cancel')
		)) {
			return;
		}

		let cmpFun = (function () {
			switch (id) {
			case 'colTask':
				if (Prefs.showOnlyFilenames) {
					return function(d) {
						return d.destinationName;
					};
				}
				return function(d) {
					return d.urlManager.usable;
				};
			case 'colSize':
				return function(d) {
					return d.totalSize;
				};
			case 'colStatus':
				return function(d) {
					return d.status;
				};
			case 'colPath':
				return function(d) {
					return d.destinationPath;
				};
			case 'colDomain':
				return function(d) {
					return d.urlManager.domain;
				};
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
			this.savePositions();
			this.invalidate();
			this.endUpdate();
		}
	}

	doFilter() {
		if (this._updating) {
			this._mustFilter = true;
			return;
		}
		this.beginUpdate();
		try {
			// save selection
			let selectedIds = this._getSelectedFilteredIds();

			this._box.rowCountChanged(0, -this.rowCount);
			if (this.filtered) {
				this._filtered = this._matcher.filter(this._downloads);
			}
			else {
				this._filtered = this._downloads;
				for (let i = 0, e = this._filtered.length; i < e; ++i) {
					this._filtered[i].filteredPosition = i;
				}
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
					if (oid !== eid + 1) {
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
	}

	doFilterOne(d) {
		const display = !this.filtered || this._matcher.shouldDisplay(d);
		if (display === !!~d.filteredPosition) {
			return false;
		}
		if (this._updating) {
			this._mustFilter = true;
			return true;
		}
		try {
			if (!display) {
				// Hide
				let fp = d.filteredPosition;
				this._box.rowCountChanged(fp, -1);
				this._filtered.splice(fp, 1);
				d.filteredPosition = -1;
				for (let i = fp, e = this._filtered.length; i < e; ++i) {
					this._filtered[i].filteredPosition = i;
				}
				return true;
			}

			// Display
			// first first non-filtered
			let fp = -1;
			for (let i = d.position, e = this._downloads.length; i < e; ++i) {
				if (~(fp = this._downloads[i].filteredPosition)) {
					break;
				}
			}
			if (~fp) {
				this._filtered.splice(fp, 0, d);
				for (let i = fp, e = this._filtered.length; i < e; ++i) {
					this._filtered[i].filteredPosition = i;
				}
			}
			else {
				fp = d.filteredPosition = this._filtered.push(d) - 1;
			}
			this._box.rowCountChanged(fp, 1);
		}
		catch (ex) {
			log(LOG_ERROR, "doFilterOne", ex);
			this.doFilter();
		}
		return true;
	}

	setFilter(nv) {
		if (nv === this._filter) {
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
	}

	getParentIndex(idx) {
		// no parents, as we are actually a list
		return -1;
	}

	getLevel(idx) {
		// ... and being a list all nodes are on the same level
		return 0;
	}

	getCellText(idx, col) {
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
	}

	setCellText(idx, col, text) {
		text = Utils.getUsableFileName(text);
		if (col.index || !text) {
			return;
		}
		const d = this._filtered[idx];
		const from = d.destinationLocalFile;
		const to = from.clone();
		to.leafName = text;
		if (from.leafName === to.leafName) {
			log(LOG_DEBUG, "nothing");
			return; // nothing to do
		}
		if (!d.is(COMPLETE)) {
			d.setUserFileName(to.leafName);
			log(LOG_DEBUG, "reset");
			return; // complete logic will do this
		}

		this._moveToNewLocation(d, from, to);
	}

	isSorted() {
		return true;
	}

	isContainer(idx) {
		return false;
	}

	isContainerOpen(idx) {
		return false;
	}

	isContainerEmpty(idx) {
	 	return false;
	}

	isSeparator(idx) {
		return false;
	}

	isEditable(row, col) {
		return !col.index;
	}


	// will grab the "icon" for a cell.
	getImageSrc(idx, col) {}

	getProgressMode(idx, col) {
		if (col.index === 2) {
			const d = this._filtered[idx];
			if (!d) {
				return 2;
			}
			const state = d.state;
			if (state === PAUSED && (!d.totalSize || d.progress < 5)) {
				return 2; // PROGRESS_UNDETERMINED;
			}
			if (state === RUNNING && !d.totalSize) {
				return 2; // PROGRESS_UNDETERMINED;
			}
			return 1; // PROGRESS_NORMAL;
		}
		return 3; // PROGRESS_NONE;
	}

	// will be called for cells other than textcells
	getCellValue(idx, col) {
		if (col.index === 2) {
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
	}

	getCellProperties(idx, col) {
		const cidx = col.index;
		if (cidx !== 2 && cidx !== 0) {
			return "";
		}
		else if (cidx === 2) {
			let d = this._filtered[idx];
			if (!d) {
				return this._cpprop_iconic;
			}
			switch (d.state) {
			case QUEUED:
				return this._cpprop_iconic;
			case COMPLETE:
				if (d.hashCollection) {
					return this._cpprop_iconicverified;
				}
				return this._cpprop_iconiccomplete;
			case PAUSED:
				if (!d.totalSize || d.progress < 5) {
					if (d.autoRetrying) {
						return this._cpprop_iconicpausedundeterminedretrying;
					}
					return this._cpprop_iconicpausedundetermined;
				}
				if (d.autoRetrying) {
					return this._cpprop_iconicpausedretrying;
				}
				return this._cpprop_iconicpaused;
			case FINISHING:
				return this._cpprop_iconicfinishing;
			case RUNNING:
				return this._cpprop_iconicinprogress;
			case CANCELED:
				return this._cpprop_iconicicanceled;
			}
		}
		else if (cidx === 0) {
			let d = this._filtered[idx];
			if (!d) {
				return "";
			}
			return d.iconProp;
		}
		return "";
	}

	cycleHeader(col) {
		if (!col.element.hasAttribute("matcher")) {
			return;
		}
		this.handleMatcherPopupshowing(col.element);
	}

	// just some stubs we need to provide anyway to implement a full nsITreeView
	cycleCell(idx, column) {}

	performAction(action) {}

	performActionOnRow(action, index, column) {}

	performActionOnCell(action, index, column) {}

	getColumnProperties(column, element) {
		return "";
	}

	getRowProperties(idx) {
		return "";
	}

	setCellValue(idx, col, value) {}

	selectionChanged() {
		if (this._updating) {
			return;
		}
		if (this._changeTimer) {
			clearTimeout(this._changeTimer);
		}
		this._changeTimer = setTimeoutOnlyFun(() => {
			this._changeTimer = null;
			this.refreshTools();
		}, 100);
	}

	onDragStart(event) {
		let transfer = event.dataTransfer;
		let i = 0;
		transfer.effectAllowed = "copymove";
		for (let qi of this.getSelected()) {
			try {
				if (qi.state === COMPLETE) {
					let file = qi.destinationLocalFile;
					if (file.exists()) {
						transfer.mozSetDataAt(
							"application/x-moz-file",
							new FileDataProvider(this, qi, file),
							i++);
					}
				}
				transfer.setData("application/x-dta-position", qi.position);
				i++;
			}
			catch (ex) {
				log(LOG_ERROR, "dnd failure", ex);
			}
			return;
		}
	}

	canDrop(index, orient, dt) {
		let rv = dt.types.contains("application/x-dta-position");
		if (rv) {
			dt.dropEffect = "move";
		}
		return rv;
	}

	drop(row, orient, dt) {
		log(LOG_DEBUG, "drop");
		if (!this.canDrop(row, orient, dt)) {
			return;
		}
		try {
			this.beginUpdate();
			let downloads;
			try {
				// means insert_after, so we need to adjust the row
				if (orient === 1) {
					++row;
				}
				// translate row from filtered list to full list
				let realRow = this._filtered[row].position;

				/* first we remove the dragged items from the list
				 * then we reinsert them if the dragged item is location before the drop
				 * position we need to adjust it (as we remove the item first) after we
				 * collected all items we simply reinsert them and invalidate our list.
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
				this.savePositions();
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(Math.max(row, 0));
			this.selection.rangedSelect(row, row + downloads.length - 1, true);
		}
		catch (ex) {
			log(LOG_ERROR, "_dropSelection", ex);
		}
	}

	beginUpdate() {
		if (++this._updating === 1) {
			this._box.beginUpdateBatch();
		}
	}

	endUpdate() {
		if (--this._updating === 0) {
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
	}

	fastLoad(download) {
		if (download.state === COMPLETE) {
			++Dialog.completed;
		}
		let dummy = download.iconProp; // set up initial icon to avoid display problems
		return this._downloads.push(download) - 1;
	}

	add(download) {
		let pos = download.position = this.fastLoad(download);
		if (this.filtered) {
			download.filteredPosition = -1;
			this.doFilterOne(download);
		}
		else {
			download.filteredPosition = pos;
		}
		this.fireChangeEvent();
		return pos;
	}

	scrollToNearest(download) {
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
	}

	removeWithConfirmation() {
		if (Prefs.confirmRemove) {
			let res = Prompts.confirm(
				window,
				_('remove.title'),
				_('removequestion'),
				Prompts.YES,
				Prompts.NO,
				null,
				0,
				false,
				_('dontaskagain'));
			if (res.checked) {
				Preferences.setExt('confirmremove', false);
			}
			if (res.button) {
				return;
			}
		}
		this.remove(null, true);
	}

	removeAllWithConfirmation() {
		let res = Prompts.confirm(window, _('remove.title'), _('removeallquestion'), Prompts.YES, Prompts.NO);
		if (res) {
			return;
		}
		this.remove(this._downloads.map(e => e), true);
	}

	removeHostWithConfirmation() {
		let domain = this.current.urlManager.domain;
		let res = Prompts.confirm(
			window,
			_('remove.title'),
			_('removehostquestion', [domain]),
			Prompts.YES,
			Prompts.NO);
		if (res) {
			return;
		}
		this.remove(this._downloads.filter(e => e.urlManager.domain === domain), true);
	}

	removeBatchWithConfirmation() {
		let bid = this.current.bNum;
		if (Prefs.confirmRemove) {
			let res = Prompts.confirm(
					window,
					_('remove.title'),
					_('removebatchquestion', [bid]),
					Prompts.YES,
					Prompts.NO);
			if (res) {
				return;
			}
		}
		this.remove(this._downloads.filter(e => e.bNum === bid), true);
	}

	removeByFilter(filter, id) {
		let pref = null;
		let mask = -1;
		let msg = null;
		switch (id) {
		case 'removePopup':
			pref = 'confirmremove.' + filter.id;
			msg = 'removefilter.question';
			mask = COMPLETE | QUEUED | CANCELED | PAUSED;
			break;
		case 'removeCompletedPopup':
			pref = 'confirmremovecompleted.' + filter.id;
			msg = 'removecompletedfilter.question';
			mask = COMPLETE;
			break;
		default:
			throw new Exception("Invalid access");
		}

		if (Preferences.getExt(pref, true)) {
			let res = Prompts.confirm(
				window,
				_('remove.title'),
				_(msg, [filter.label]),
				Prompts.YES, Prompts.NO,
				null, 0, false, _('dontaskagain'));
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
			this.remove(downloads);
		}
	}

	fireChangeEvent() {
		if (this._updating) {
			this._mustFireChangeEvent = true;
			return;
		}
		let evt = document.createEvent("UIEvents");
		evt.initUIEvent("change", true, true, null, 0);
		return this.elem.dispatchEvent(evt);
	}

	remove(downloads, performJump) {
		if (downloads && !(downloads instanceof Array)) {
			downloads = [downloads];
		}
		else if (!downloads) {
			downloads = this.getSelected();
		}
		if (!downloads.length) {
			return;
		}

		downloads = downloads.sort(function(a, b) {
			return b.position - a.position;
		});
		let last = 0;

		this.beginUpdate();
		try {
			let removedDownloads = [];
			for (let i = 0; i < downloads.length; ++i) {
				let d = downloads[i];
				if (d.state === FINISHING) {
					// un-removable :p
					continue;
				}
				this._downloads.splice(d.position, 1);
				if (d.filteredPosition >= 0) {
					this._box.rowCountChanged(d.filteredPosition, -1);
				}
				last = Math.max(d.filteredPosition, last);
				if (!d.isOf(RUNNING | PAUSED)) {
					Dialog.wasRemoved(d);
				}
				// wipe out any info/tmpFiles
				if (!d.isOf(COMPLETE | CANCELED)) {
					d.deleting = true;
					d.cancel();
				}
				d.setState(CANCELED);
				d.cleanup();
				removedDownloads.push(d);
			}
			QueueStore.deleteDownloads(removedDownloads);
		}
		finally {
			this.savePositionsByOffsets();
			this.invalidate();
			this.doFilter();
			this.endUpdate();
		}
		if (performJump) {
			this._removeJump(filterInSitu(downloads, e => e.filteredPosition >= 0).length, last);
		}
	}

	removeCompleted() {
		if (Prefs.confirmRemoveCompleted) {
			let res = Prompts.confirm(
				window,
				_('remove.title'),
				_('removecompletedquestion'),
				Prompts.YES,
				Prompts.NO,
				null,
				0,
				false,
				_('dontaskagain'));
			if (res.checked) {
				Preferences.setExt('confirmremovecompleted', false);
			}
			if (res.button) {
				return;
			}
		}
		this._removeByState(COMPLETE, false);
	}

	removeFailed() {
		if (Prefs.confirmRemoveFailed) {
			let res = Prompts.confirm(
				window,
				_('remove.title'),
				_('removefailedquestion'),
				Prompts.YES,
				Prompts.NO,
				null,
				0,
				false,
				_('dontaskagain'));
			if (res.checked) {
				Preferences.setExt('confirmremovefailed', false);
			}
			if (res.button) {
				return;
			}
		}
		this._removeByState(CANCELED, false);
	}

	removePaused() {
		if (Prefs.confirmRemovePaused) {
			let res = Prompts.confirm(
				window,
				_('remove.title'),
				_('removepausedquestion'),
				Prompts.YES,
				Prompts.NO,
				null,
				0,
				false,
				_('dontaskagain'));
			if (res.checked) {
				Preferences.setExt('confirmremovepaused', false);
			}
			if (res.button) {
				return;
			}
		}
		this._removeByState(PAUSED, false);
	}

	removeDupes() {
		let known = {};
		let dupes = [];
		for (let d of this.all) {
			let url = d.urlManager.spec;
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
	}

	removeGone() {
		this._removeByState(COMPLETE, true);
	}

	_removeJump(delta, last) {
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
	}

	_pause_item(d) {
		if (d.isOf(QUEUED | PAUSED | CANCELED) || (d.state === RUNNING && d.resumable)) {
			d.pause();
			d.clearAutoRetry();
			d.status = TextCache_PAUSED;
			d.setState(PAUSED);
		}
		return true;
	}

	pause() {
		this.updateSelected(this._pause_item);
	}

	_resume_item(d) {
		if (d.isOf(PAUSED | CANCELED)) {
			d.liftLoginRestriction = true;
			d.queue();
		}
		return true;
	}

	resume(d) {
		this.updateSelected(this._resume_item);
	}

	_cancel_item(d) {
		return d.cancel() || true;
	}

	cancel() {
		if (Prefs.confirmCancel) {
			let many = this.selection.count > 1;
			let res = Prompts.confirm(
					window,
					_('cancel.title'),
					_(many ? 'cancelmanytext' : 'canceltext' ),
					_(many ? 'docancelmany' : 'docancel'),
					_('dontcancel'),
					null, 1, false, _('dontaskagain'));
			if (res.checked) {
				Preferences.setExt('confirmcancel', false);
			}
			if (res.button) {
				return;
			}
		}
		this.updateSelected(this._cancel_item);
	}

	selectAll() {
		this.selection.selectAll();
		this.selectionChanged();
	}

	selectInv() {
		for (let d of this.all) {
			this.selection.toggleSelect(d.position);
		}
		this.selectionChanged();
	}

	_changeChunks_inc(d) {
		if (d.maxChunks < 10 && d.resumable) {
			++d.maxChunks;
		}
		return true;
	}

	_changeChunks_dec(d) {
		if (d.maxChunks > 1) {
			--d.maxChunks;
		}
		return true;
	}

	changeChunks(increase) {
		this.updateSelected(increase ? this._changeChunks_inc : this._changeChunks_dec);
	}

	force() {
		for (let d of this.getSelected()) {
			if (d.isOf(QUEUED | PAUSED | CANCELED)) {
				d.queue();
				Dialog.run(d, true);
			}
		}
	}

	manageMirrors() {
		if (!this.current) {
			return;
		}
		let mirrors = this.current.urlManager.toArray();
		window.openDialog(
			'chrome://dta/content/dta/mirrors.xul',
			null,
			"chrome,dialog,resizable,modal,centerscreen",
			mirrors
		);
		if (mirrors.length) {
			this.current.replaceMirrors(mirrors);
			log(LOG_INFO, "New mirrors set " + mirrors);
		}
	}

	export() {
		function processResponse(fp, rv) {
			if (rv !== Ci.nsIFilePicker.returnOK && rv !== Ci.nsIFilePicker.returnReplace) {
				return;
			}
			try {
				let fs = fp.file;
				if (!(/\.[\d\w-]{1,4}/.test(fs.leafName)) && fp.filterIndex !== 4) {
					if (fp.filterIndex === 0) {
						fs.leafName += ".html";
					}
					else if (fp.filterIndex === 2) {
						fs.leafName += ".metalink";
					}
					else if(fp.filterIndex === 3) {
						fs.leafName += ".meta4";
					}
					else {
						fs.leafName += ".txt";
					}
				}
				if (/\.x?html$/i.test(fs.leafName) || fp.filterIndex === 0) {
					ImportExport.exportToHtmlFile(this.getSelected(), document, fs, Prefs.permissions);
				}
				else if (/\.metalink$/i.test(fs.leafName) || fp.filterIndex === 2) {
					ImportExport.exportToMetalinkFile(this.getSelected(), document, fs, Prefs.permissions);
				}
				else if(/\.meta4$/i.test(fs.leafName) || fp.filterIndex === 3) {
					ImportExport.exportToMetalink4File(this.getSelected(), document, fs, Prefs.permissions);
				}
				else {
					ImportExport.exportToTextFile(this.getSelected(), fs, Prefs.permissions);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "Cannot export downloads (process response)", ex);
				Prompts.alert(window, _('export.title'), _('exportfailed'));
			}
		}
		try {
			let fp = new Instances.FilePicker(window, _('export.title'), Ci.nsIFilePicker.modeSave);
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
			Prompts.alert(window, _('export.title'), _('exportfailed'));
		}
	}

	import() {
		const processResponse = async function(fp, rv) {
			if (rv !== Ci.nsIFilePicker.returnOK) {
				return;
			}
			try {
				if (/\.(xml|meta(4|link))$/i.test(fp.file.leafName)) {
					Metalinker.handleFile(fp.file);
					return;
				}
				let lnks = await ImportExport.parseTextFile(fp.file);
				if (lnks.length) {
					DTA.saveLinkArray(window, lnks, []);
				}
			}
			catch (ex) {
				log(LOG_ERROR, "Cannot import downloads (processResponse)", ex);
				Prompts.alert(window, _('import.title'), _('importfailed'));
			}
		};
		try {
			let fp = new Instances.FilePicker(window, _('import.title'), Ci.nsIFilePicker.modeOpen);
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
			Prompts.alert(window, _('import.title'), _('importfailed'));
		}
	}

	addLimits() {
		showPreferences(
			"paneServers",
			{
				action: "addlimits",
				url: this.current.urlManager.spec
			}
		);
	}

	showInfo() {
		this.beginUpdate();
		try {
			let downloads = [];
			for (let d of this.getSelected()) {
				downloads.push(d);
			}
			if (downloads.length) {
				Dialog.openInfo(downloads);
			}
		}
		finally {
			this.endUpdate();
		}
	}

	showTip(event) {
		if (!Prefs.showTooltip || Services.ww.activeWindow !== window) {
			return false;
		}
		let row = {};
		this._box.getCellAt(event.clientX, event.clientY, row, {}, {});
		if (row.value === -1) {
			return false;
		}
		let d = this.at(row.value);
		if (!d) {
			return false;
		}
		$("infoIcon").src = d.largeIcon;
		$("infoURL").value = d.urlManager.spec;
		$("infoDest").value = d.destinationFile;
		$("infoDate").value = d.startDate.toLocaleString();
		$("infoPrivate").hidden = !d.isPrivate;

		Tooltip.start(d, true);
		return true;
	}

	stopTip() {
		Tooltip.stop();
	}

	_refreshTools_init() {
		this._refreshTools_item.forEach(function(e) {
			e.item = $(e.item);
		});
		this._refreshTools_items.forEach(function(e) {
			e.items = $(...e.items);
		});
		this._refreshTools_items_deferred.forEach(function(e) {
			e.items = $(...e.items);
		});
	}

	_stateIs(s) {
		return this.state & s;
	}

	refreshTools(d) {
		if (this._updating || (d && ('position' in d) && !this.selection.isSelected(d.position))) {
			return;
		}
		try {
			let empty = this.current === null;
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
				is: this._stateIs,
				isOf: QueueItem.prototype.isOf,
				count: this.selection.count,
				rows: this.rowCount,
				min: this.rowCount,
				max: 0,
				minId: this._downloads.length,
				maxId: 0,
			};
			for (let qi of this.getSelected()) {
				states.state |= qi.state;
				states.resumable |= qi.resumable;
				states.min = Math.min(qi.filteredPosition, states.min);
				states.max = Math.max(qi.filteredPosition, states.max);
				states.minId = Math.min(qi.position, states.minId);
				states.maxId = Math.max(qi.position, states.maxId);
			}
			let cur = this.current;
			for (let i = 0, e = this._refreshTools_item.length; i < e; ++i) {
				let item = this._refreshTools_item[i];
				let disabled = item.f.call(this, states) ? "false" : "true";
				item.item.setAttribute("disabled", disabled);
			}
			for (let i = 0, e = this._refreshTools_items.length; i < e; ++i) {
				let items = this._refreshTools_items[i];
				let disabled = items.f.call(this, states) ? "false" : "true";
				items = items.items;
				for (let ii = 0, ee = items.length; ii < ee; ++ii) {
					items[ii].setAttribute("disabled", disabled);
				}
			}
			this._refreshToolsAsync(states, cur);
		}
		catch (ex) {
			log(LOG_ERROR, "rt", ex);
		}
	}

	savePositions() {
		let saveArray = [];
		for (let i = 0, e = this._downloads.length; i < e; ++i) {
			let d = this._downloads[i];
			if (d.position !== i) {
				d.position = i;
				saveArray.push({dbId: d.dbId, position: i});
			}
		}
		if (saveArray.length) {
			QueueStore.savePositions(saveArray);
			this.fireChangeEvent();
		}
	}

	savePositionsByOffsets() {
		// Special case: When deleting we know that we will only reduce .position.
		// This allows for DB updates based on offsets instead of absolute positions,
		// reducing the number of queries (param bindings) a lot, thus avoiding
		// overhead on the main thread.
		let offset = 0;
		var sp = null;
		for (let i = 0, e = this._downloads.length; i < e; ++i) {
			let d = this._downloads[i];
			if (d.position === i) {
				continue;
			}
			let no = d.position - i;
			d.position = i;
			if (no === offset) {
				continue;
			}
			(sp || (sp = QueueStore.getSavePositionsByOffset())).execute(i, no - offset);
			offset = no;
		}
		if (sp) {
			sp.finalize();
			this.fireChangeEvent();
		}
	}

	_invalidate_item(d, cell) {
		if (d.position >= 0 && !this.doFilterOne(d) && ~d.filteredPosition) {
			if (cell !== undefined) {
				this._box.invalidateCell(d.filteredPosition, this._cols[cell]);
			}
			else {
				this._box.invalidateRow(d.filteredPosition);
			}
		}
	}

	invalidate(d, cell) {
		if (!d) {
			FileExts.add();
			this._box.invalidate();
			this.fireChangeEvent();
			return;
		}

		if (d instanceof Array) {
			for (let i = 0, e = d.length; i < e; ++i) {
				this._invalidate_item(d[i], cell);
			}
			return;
		}
		this._invalidate_item(d, cell);
	}

	getSelected() {
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
		return rv;
	}

	// returns an ASC sorted array of IDs that are currently selected.
	_getSelectedIds(getReversed) {
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
	}

	_getSelectedIds_asc(a, b) {
		return a - b;
	}

	_getSelectedIds_desc(a, b) {
		return b - a;
	}

	_getSelectedFilteredIds_map(id) {
		return this._filtered[id].position;
	}

	_getSelectedFilteredIds(reverse) {
		return mapInSitu(this._getSelectedIds(reverse), this._getSelectedFilteredIds_map, this);
	}

	at(idx) {
		return this._filtered[idx];
	}

	some(f, t) {
		return this._downloads.some(f, t);
	}

	every(f, t) {
		return this._downloads.every(f, t);
	}

	update(f, t) {
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
	}

	updateSelected(fn, ctx) {
		this.beginUpdate();
		QueueStore.beginUpdate();
		try {
			for (let i of this.getSelected()) {
				try {
					fn.call(ctx, i);
				}
				catch (ex) {
					log(LOG_ERROR, "Updating an item failed!");
				}
			}
		}
		catch (ex) {
			log(LOG_ERROR, "function threw during _gen", ex);
			throw ex;
		}
		finally {
			QueueStore.endUpdate();
			this.invalidate();
			this.endUpdate();
		}
	}

	updateAll(fn, ctx) {
		try {
			this.beginUpdate();
			QueueStore.beginUpdate();
			try {
				for (let d of this.all) {
					if (!fn.call(ctx, d)) {
						break;
					}
				}
			}
			finally {
				QueueStore.endUpdate();
				this.endUpdate();
			}
		}
		catch (ex) {
			log(LOG_ERROR, "function threw during updateAll", ex);
			throw ex;
		}
	}

	moveTop() {
		try {
			this.beginUpdate();
			let ids;
			try {
				ids = this._getSelectedFilteredIds(true);
				for (let i = 0, e = ids.length; i < e; ++i) {
					let id = ids[i] + i;
					this._downloads.unshift(this._downloads.splice(id, 1)[0]);
				}
				this.doFilter();
			}
			finally {
				this.savePositions();
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(0);
			this.selection.rangedSelect(0, ids.length - 1, true);
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::top", ex);
		}
	}

	moveBottom() {
		try {
			this.beginUpdate();
			let ids;
			try {
				ids = this._getSelectedFilteredIds();
				for (let i = 0, e = ids.length; i < e; ++i) {
					let id = ids[i] - i;
					this._downloads.push(this._downloads.splice(id, 1)[0]);
				}
				this.doFilter();
			}
			finally {
				this.savePositions();
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(this.rowCount - 1);
			this.selection.rangedSelect(this._filtered.length - ids.length, this._filtered.length - 1, true);
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::bottom", ex);
		}
	}

	moveUp() {
		try {
			if (this.filtered) {
				throw Error("not implemented");
			}
			this.beginUpdate();
			let ids;
			try {
				ids = mapInSitu(
					this._getSelectedFilteredIds(),
					function(id, idx) {
						if (id - idx !== 0) {
							[this._downloads[id], this._downloads[id - 1]] =
								[this._downloads[id - 1], this._downloads[id]];
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
				this.savePositions();
				this.invalidate();
				this.endUpdate();
			}
			this._box.ensureRowIsVisible(Math.max(ids[0] - 1, 0));
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::up", ex);
		}
	}

	moveDown() {
		try {
			if (this.filtered) {
				throw Error("not implemented");
			}
			this.beginUpdate();
			let ids;
			try {
				let rowCount = this.rowCount;
				ids = mapInSitu(
					this._getSelectedIds(true),
					function(id, idx) {
						if (id + idx !== rowCount - 1) {
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
				this.savePositions();
				this.invalidate();
				this.endUpdate();
			}
			// readjust view
			this._box.ensureRowIsVisible(Math.min(ids[0], this.rowCount - 1));
		}
		catch (ex) {
			log(LOG_ERROR, "Mover::down", ex);
		}
	}

	showSpeedLimitList(event) {
		if (!this.selection.count) {
			return false;
		}
		let selection = this.getSelected();
		let limit = selection.shift().speedLimit;
		for (let qi of selection) {
			if (limit !== qi.speedLimit) {
				limit = -1;
			}
		}
		this._speedLimitList.limit = limit;
		return true;
	}

	_changePerDownloadSpeedLimit_item(limit, d) {
		return (d.speedLimit = limit) || true;
	}

	changePerDownloadSpeedLimit() {
		let limit = $('perDownloadSpeedLimitList').limit;
		this.updateSelected(this._changePerDownloadSpeedLimit_item.bind(null, limit));
	}

	startRename() {
		try {
			let ci = {value: -1};
			this.selection.getRangeAt(0, ci, {});
			if (ci.value < 0 || ci.value >= this.rowCount) {
				return;
			}
			this.elem.setAttribute("editable", true);
			try {
				this.elem.startEditing(ci.value, this.box.columns.getFirstColumn());
			}
			finally {
				this.elem.removeAttribute("editable");
			}
		}
		catch (ex) {
			log(LOG_ERROR, "Cannot rename", ex);
		}
	}

	async _refreshToolsAsync(states, cur) {
		try {
			if (!cur || cur.state !== COMPLETE) {
				states.curFile = states.curFolder = false;
				this._refreshLastDest = null;
			}
			else if (this._refreshLastDest === cur.destinationLocalFile.path) {
				states.curFile = this._refreshLastDestExists;
				states.curFolder = this._refreshLastDestPathExists;
			}
			else {
				this._refreshLastDest = cur.destinationLocalFile.path;
				states.curFile = this._refreshLastDestExists = await OS.File.exists(
					this._refreshLastDest);
				if (states.curFile) {
					states.curFolder = this._refreshLastDestPathExists = true;
				}
				else {
					states.curFolder = this._refreshLastDestPathExists = await OS.File.exists(
						new Instances.LocalFile(cur.destinationPath).path);
				}
			}
			for (let items of this._refreshTools_items_deferred) {
				let disabled = items.f.call(this, states) ? "false" : "true";
				items = items.items;
				for (let item of items) {
					item.setAttribute("disabled", disabled);
				}
			}
		}
		catch (tex) {
			log(LOG_ERROR, "rt (task)", tex);
		}
	}

	async _removeByState(state, onlyGone) {
		this.beginUpdate();
		try {
			QueueStore.beginUpdate();
			var removing = [];
			for (let d of this._downloads) {
				if (d.state !== state) {
					continue;
				}
				if (onlyGone && (await OS.File.exists(d.destinationLocalFile.path))) {
					continue;
				}
				removing.push(d);
			}
			if (removing.length) {
				this.remove(removing);
			}
			QueueStore.endUpdate();
		}
		finally {
			this.invalidate();
			this.endUpdate();
		}
	}

	async _moveToNewLocation(download, from, to) {
		try {
			if (!(await OS.File.exists(from.path))) {
				download.setUserFileName(to.leafName);
				log(LOG_DEBUG, "gone");
				return; // gone already
			}
			if ((await OS.File.exists(to.path))) {
				Prompts.alert(window, _("rename.title"), _("rename.alreadythere", [from.leafName, to.path]));
				log(LOG_DEBUG, "exists");
				return;
			}

			log(LOG_DEBUG, "move " + from.path + " to " + to.path);
			// need to move
			await OS.File.move(from.path, to.path);
			log(LOG_DEBUG, "move complete " + from.path + " to " + to.path);

			download.setUserFileName(to.leafName);
		}
		catch (ex) {
			log(LOG_DEBUG, "move failed " + from.path + " to " + to.path, ex);
			Prompts.alert(window, _("rename.title"), _("rename.failedtomove", [from.path, to.path]));
		}
	}

	*_uniqueList() {
		let u = {};
		for (let d of this.getSelected()) {
			if (d.state !== COMPLETE) {
				continue;
			}
			let f = d.destinationFile;
			if (Utils.SYSTEMSLASH === "\\") {
				f = f.toLowerCase();
			}
			if (!(f in u)) {
				u[f] = null;
				yield d;
			}
		}
	}

	openFolder() {
		for (let d of this.getSelected()) {
			try {
				if (new Instances.LocalFile(d.destinationPath).exists()) {
					Utils.reveal(d.destinationFile);
				}
			}
			catch (ex) {
				log(LOG_ERROR, 'reveal', ex);
			}
		}
	}

	openFile() {
		let cur = this.current;
		if (cur && cur.state === COMPLETE) {
			try {
				Utils.launch(cur.destinationFile);
			}
			catch (ex) {
				log(LOG_INFO, 'launch', ex);
			}
		}
	}

	async deleteFile() {
		try {
			let list = [];
			for (let d of this._uniqueList()) {
				list.push(d);
			}
			let msg = '';
			if (list.length < 25) {
				msg = _('deletetexts');
				for (let d of list) {
					msg += "\n" + d.destinationLocalFile.leafName;
				}
			}
			else {
				msg = _('deletetextl.2', [list.length], list.length);
			}
			if (list.length && Prompts.confirm(
				window, _('deletecaption'), msg, _('delete'), Prompts.CANCEL, null, 1)) {
				return;
			}
			for (let d of list) {
				try {
					await OS.File.remove(d.destinationLocalFile.path);
				}
				catch (ex) {
					// no-op
				}
			}
			this.remove(list, true);
		}
		catch (ex) {
			log(LOG_ERROR, "deleteFile", ex);
		}
	}
}

Object.assign(TreeManager.prototype, {
	_cpprop_iconic: "iconic progress",
	_cpprop_iconiccomplete: "iconic progress completed",
	_cpprop_iconicfinishing: "iconic progress finishing",
	_cpprop_iconicverified: "iconic progress completed verified",
	_cpprop_iconicpaused: "iconic progress paused",
	_cpprop_iconicpausedundetermined: "iconic progress paused pausedUndetermined",
	_cpprop_iconicpausedretrying: "iconic progress paused pausedAutoretrying",
	_cpprop_iconicpausedundeterminedretrying: "iconic progress paused pausedUndetermined pausedAutoretrying",
	_cpprop_iconicinprogress: "iconic progress inprogress",
	_cpprop_iconicicanceled: "iconic progress canceled",
	_refreshTools_item: [
		{item: 'cmdResume', f: function(d) {
			return d.isOf(PAUSED | QUEUED | CANCELED);
		}},
		{item: 'cmdPause', f: function(d) {
			return (d.isOf(RUNNING) && d.resumable) || d.isOf(QUEUED | PAUSED | CANCELED);
		}},
		{item: 'cmdCancel', f: function(d) {
			return d.isOf(PAUSED | RUNNING | QUEUED | COMPLETE);
		}},

		{item: 'cmdMoveUp', f: function(d) {
			return !this.filtered && d.min > 0;
		}},
		{item: 'cmdMoveTop', f: function(d) {
			return d.minId > 0;
		}},
		{item: 'cmdMoveDown', f: function(d) {
			return !this.filtered && d.max !== d.rows - 1;
		}},
		{item: 'cmdMoveBottom', f: function(d) {
			return d.maxId !== this._downloads.length - 1;
		}}
	],
	_refreshTools_items: [
		{items: ["cmdDelete", "delete"], f: function(d) {
			return d.state === COMPLETE;
		}},

		{items: ['cmdRemoveSelected', 'cmdExport', 'cmdGetInfo', 'perDownloadSpeedLimit'],
			f: function(d) { return !!d.count; }},
		{items: ['cmdMirrors', 'cmdAddLimits', 'cmdRename'],
			f: function(d) { return d.count === 1; }},
		{items: ['cmdAddChunk', 'cmdRemoveChunk', 'cmdForceStart'],
			f: function(d) { return d.isOf(QUEUED | RUNNING | PAUSED | CANCELED); }},
	],
	_refreshTools_items_deferred: [
		{items: ['cmdLaunch', "launch"], f: function(d) {
			return !!d.curFile;
		}},
		{items: ["cmdOpenFolder", "folder"], f: function(d) {
			return !!d.curFolder;
		}},
	],
});
requireJoined(TreeManager.prototype, "manager/matcher");
requireJoined(TreeManager.prototype, "support/atoms");
