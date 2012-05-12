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

/* tree helpers */
function treeIconGetter() {
	delete this.icon;
	return (this.icon = getIcon(this.url.url.spec, 'metalink' in this));
}
function treeDescGetter() {
	delete this.desc;
	this.desc = "";
	if ("description" in this && this.description.length > 0) {
		this.desc += this.description;
	}
	if ("title" in this && this.title.length > 0) {
		this.desc += ((this.desc.length > 0) ? ' - ' : '') + this.title;
	}
	return this.desc;
}
function treeResnameGetter() {
	delete this.resname;
	return (this.resname = this.url.usable.getUsableFileName());
}
function treeLinksMapper(link) {
	// "lazy initialize" the icons.
	// cache them so that we don't have to lookup them again and again.
	// but do not precompute them, as we don't know if we'll ever display
	// them.
	link.__defineGetter__('icon', treeIconGetter);

	// same here for description
	link.__defineGetter__('desc', treeDescGetter);
	link.__defineGetter__('resname', treeResnameGetter);

	// .checked will hold the correspoding 'property' string, either none,
	// manuallySelected, or f0-f8
	link.checked = '';
	link.mask = null;
	return link;
}

/**
 * implemtents nsITreeView manages our link trees
 */
function Tree(links, type) {

	// type corresponding to FilterManager
	this._type = type;

	// internal list of links.
	// better make this a real array (links parameter is usually an object)
	this._links = mapInSitu(links, treeLinksMapper);

	// atom cache. See getAtom
	this._atoms = new this.Atoms();
}
Tree.prototype = {
	// getter only -> readonly
	get type() {
		return this._type;
	},

	// will invalidate the whole box and update the statusbar.
	invalidate: function() {
		if (this._box) {
			// invalidate specific cell(s)
			if (arguments && arguments.length) {
				for (let i = 0; i < arguments.length; ++i) {
					this._box.invalidateRow(arguments[i]);
				}
			}
			// invalidate whole box
			else {
				this._box.invalidate();
			}
		}

		// compute and set the checked count
		let checked = 0;
		this._links.forEach(function(e) { if (e.checked.length){++checked;} });

		if (checked) {
			$("status").label = _("selel", [checked, this.rowCount]);
		} else {
			$("status").label = _("status");
		}
	},
	isChecked: function(idx) this._links[idx].checked.length != 0,

	/*
	 * actual nsITreeView follows
	 */
	get rowCount() this._links.length,

	// used to initialize nsITreeview and provide the corresponding treeBoxObject
	setTree: function(box) {
		this._box = box;
	},

	getParentIndex: function(idx) -1,
	getLevel: function(idx) 0,

	getCellText: function(idx, col) {

		// corresponding link
		let l = this._links[idx];

		switch (col.index) {

			// check mark, sort compat
			case 0: return this.getCellValue(idx, col);

			// col 1 is the name
			case 1: return l.url.usable;

			// col 2 is the resname
			case 2: return l.resname;

			// col 3 is the description
			case 3: return l.desc;

			// col 4 is the renaming mask
			case 4: return l.mask ? l.mask : _('default');
		}
		return null;
	},

	isSorted: function() !!this._sortColumn,
	isContainer: function(idx) false,
	isContainerOpen: function(idx) false,
	isContainerEmpty: function(idx) false,
	isSeparator: function(idx) false,
	isEditable: function(idx, col) col.index == 0,

	// will grab the "icon" for a cell.
	getImageSrc: function(idx, col) {

		let l = this._links[idx];
		switch (col.index) {
			case 1: return l.icon;
		}
		return null;
	},

	// we don't provide any progressmeters
	getProgressMode : function(idx,column) {},

	// will be called for cells other than textcells
	getCellValue: function(idx, column) {
		// col 0 is the checkbox
		// didn't test the column index, as there is just one column that may call
		// it
		// BEWARE: other code in Dialog will call this function providing no column!
		return this._links[idx].checked.length ? "true" : "false";
	},

	// called when a header is called.
	// apply sorting here
	_sortColumn: null,
	_sortColumnElem: null,
	_sortDirection: false,
	removeSortMarker: function() {
		if (!this._sortColumnElem) {
			return;
		}
		this._sortColumnElem.removeAttribute('sortDirection');
	},
	setSortMarker: function() {
		if (!this._sortColumnElem) {
			return;
		}
		this._sortColumnElem.setAttribute("sortDirection", this._sortDirection ? "descending" : "ascending");
	},
	cycleHeader: function(col) {
		if (col.index == this._sortColumn) {
			this._sortDirection = !this._sortDirection;
			this._links.reverse();
			this.setSortMarker();
			this.invalidate();
			return;
		}

		this.removeSortMarker();

		log(LOG_DEBUG, "setting sortColumn = " + col.index);
		this._sortColumn = col.index;
		this._sortDirection = false;
		this._sortColumnElem = col.element;
		this.setSortMarker();

		let sd;
		this._links.forEach(function(e, i) { e._sortId = i; });

		let tp = this;
		Utils.naturalSort(this._links, function(e) tp.getCellText(e._sortId, col));
		if (this._sortDirection) {
			this._links.reverse();
		}
		this.invalidate();
	},

	// just some stubs we need to provide anyway to provide a full nsITreeView
	selectionChanged: function() {},
	cycleCell: function(idx, column) {},
	performAction: function(action) {},
	performActionOnRow: function(action, index, column) {},
	performActionOnCell: function(action, index, column) {},
	getColumnProperties: function(column, element, prop) {},

	getRowProperties: function(idx, prop) {
		let l = this._links[idx];
		// AppendElement will just accept nsIAtom.
		// no documentation on devmo, xulplanet though :p
		prop.AppendElement(this._atoms.getAtom(l.checked));
	},
	getCellProperties: function(idx, column, prop) {
		// col 1 is our url... it should display the type icon
		// to better be able to style add a property.
		if (column.index == 1) {
			prop.AppendElement(this.iconicAtom);
		}
		let l = this._links[idx];
		prop.AppendElement(this._atoms.getAtom(l.checked));
	},

	// called when the user clicks our checkboxen
	setCellValue: function(idx, col, value) {
		// set new checked state.
		let l = this._links[idx];
		if (value == "true") {
			l.checked = "manuallySelected";
			l.manuallyChecked = true;
		}
		else {
			l.checked = '';
			l.manuallySelected = false;
		}

		// a lil' hacky.
		// Dialog.toggleSelection will call us with a null column
		// makeSelection will invalidate the whole tree after it is done, so we
		// don't have to sacrifice performance here.
		// we still have to invalidate if it was a click by the user.
		if (col) {
			this.invalidate(idx);
		}
	}
};
requireJoined(Tree.prototype, "support/atoms");

/**
 * Our real, kicks ass implementation of the UI
 */
let Dialog = {

	get boxen() {
		return $('checkcontainer').getElementsByTagName('checkbox');
	},

	// will be called to initialize the dialog
	load: function DTA_load() {

		// construct or dropdowns.
		this.ddFilter = $('filter');
		this.ddDirectory = $('directory');
		if (!this.ddDirectory.value) {
			log(LOG_DEBUG, "Using default download directory, value was " + this.ddDirectory.value);
			this.ddDirectory.value = DefaultDownloadsDirectory.path;
		}
		this.ddRenaming = $('renaming');

		$('maskeditor-accept').label = _('button-accept');
		$('cancelbutton').label = $('maskeditor-cancel').label = _('button-cancel');

		try {
			// initialize or link lists
			let links = window.arguments[0];
			let images = window.arguments[1];

			// initialize the labels
			$("viewlinks").label = $("viewlinks").label + " ("+ links.length + ")";
			if (!links.length) {
				$('viewlinks').disabled = true;
			}
			$("viewpics").label = $("viewpics").label + " ("+ images.length + ")";
			if (!images.length) {
				$('viewpics').disabled = true;
			}

			// intialize our Trees (nsITreeview)
			// type parameter corresponds to Filter types
			this.links = new Tree(links, 1);
			this.images = new Tree(images, 2);

			// changeTab will initialize the filters and do the selection for us
			let preferredTab = Preferences.getExt("seltab", 0);
			if (preferredTab) {
				this.changeTab(!!images.length ? 'images' : 'links');
			}
			else {
				this.changeTab(!!links.length ? 'links': 'images');
			}

			$("urlList").addEventListener(
				'keypress',
				function(evt) {
					if (evt.charCode == ' '.charCodeAt(0)) {
						Dialog.toggleSelection();
					}
				},
				true
			);

			this._notifications = $('notifications');
			for (let x in this._notifications) {
				if (!x.match(/^PRIORITY/)) {
					break;
				}
				this[x] = this._notifications[x];
			}

			if (window.arguments[2]) {
				this.setNotification(window.arguments[2], this.PRIORITY_WARNING_HIGH, 4500);
			}
		}
		catch(ex) {
			log(LOG_ERROR, "load():", ex);
		}

		// will install our observer
		// currently just observes FilterManager
		this.registerObserver();
	},

	addNotification: function DTA_addNotification(label, priority, timeout, buttons) {
		let nb = this._notifications;
		let n = nb.appendNotification(label, 0, null, priority, buttons);
		if (isFinite(timeout) && timeout > 0) {
			setTimeoutOnlyFun(
				function() {
					nb.removeNotification(n);
				},
				timeout
			);
		}
	},
	setNotification: function DTA_setNotification(label, priority, timeout, buttons) {
		this.clearNotifications();
		this.addNotification(label, priority, timeout, buttons);
	},
	clearNotifications: function DTA_clearNotifications() {
		this._notifications.removeAllNotifications(true);
	},

	// dialog destruction
	unload: function DTA_unload() {
		close();
		return true;
	},

	// checks if we can continue to process
	check: function DTA_check() {
		this.clearNotifications();
		let dir = this.ddDirectory.value.trim();
		dir = this.ddDirectory.value = !!dir ? dir.addFinalSlash() : '';

		// mask set?
		let mask = this.ddRenaming.value.trim();
		mask = this.ddRenaming.value = mask || '';
		if (!mask.length) {
			this.addNotification(_('alertmask'), this.PRIORITY_CRITICAL_MEDIUM);
			return false;
		}

		// directory valid?
		if (!dir.length || !Utils.validateDir(dir)) {
			this.addNotification(_(dir.length ? 'alertinvaliddir' : 'alertnodir'), this.PRIORITY_CRITICAL_MEDIUM);
			if (!dir.length) {
				let newDir = Utils.askForDir(null, _("validdestination"));
				this.ddDirectory.value = newDir ? newDir : '';
			}
			return false;
		}
		return true;
	},

	// user decided to start the selection
	download: function(start) {
		try {

			// not everything correctly set. refuse to start
			if (!this.check()) {
				return false;
			}

			let dir = this.ddDirectory.value;
			let mask = this.ddRenaming.value;
			let counter = DTA.currentSeries();

			function prepare(link, dir, counter, mask) {
				link.dirSave = dir;
				link.numIstance = counter;
				link.mask = link.mask ? link.mask : mask;
				return link;
			}

			// build the actual array holding all selected links
			let links = this.current._links;
			let out = [];
			for each (let i in links) {
				try {
					if (!i.checked.length) {
						continue;
					}
					out.push(prepare(i, dir, counter, mask));
				}
				catch (ex) {
					log(LOG_ERROR, "err: " + i.toSource(), ex);
				}
			}

			// nothing selected. cannot start
			if (!out.length) {
				this.setNotification(_('nolinks'), this.PRIORITY_CRITICAL_LOW);
				return false;
			}

			// actually start the crap.
			DTA.sendLinksToManager(window, start, out);

			// save tab

			Preferences.setExt('seltab', this.current.type == 1 ? 0 : 1);
			// save history
			['ddDirectory', 'ddRenaming', 'ddFilter'].forEach(function (e) { Dialog[e].save(); });

			// save the counter, queued state
			Preferences.setExt("lastqueued", !start);

			let boxen = this.boxen;
			for (let i = 0; i < boxen.length; ++i) {
				boxen[i].filter.active = boxen[i].checked;
			}
			FilterManager.save();
			DTA.incrementSeries();

			// unload ourselves.
			return this.unload();
		}
		catch(ex) {
			log(LOG_ERROR, "Downloadfile:", ex);
		}

		// if we get here some error occured - just close.
		close();
		return false;
	},

	// edit the mask on a per item/selection basis
	editMask: function() {

		// whoops, nothing selected
		if (!this.current.selection.count) {
			return;
		}

		$('maskeditor-selector').reload();
		$('maskeditor').openPopup($('urlList'), 'overlap', 20, 20, false, false);
	},

	acceptEditMask: function() {
		let selector = $('maskeditor-selector');
		if (!selector.value || selector.value.length == 0) {
			return;
		}

		// set the new mask for each selected item
		const rangeCount = this.current.selection.getRangeCount();
		let start = {}, end = {};
		for (let r = 0; r < rangeCount; ++r) {
			this.current.selection.getRangeAt(r, start, end);
			for (let i = start.value; i <= end.value; ++i) {
				this.current._links[i].mask = selector.value;
			}
		}

		// invalidate so the new values are displayed
		this.current.invalidate();
		$('maskeditor').hidePopup();
	},

	notify: function() {
		if (this.current) {
			this.makeSelection();
		}
	},
	// will be called initially and whenever something changed
	makeSelection: function() {
		let tree = this.current;
		let type = tree.type;

		// will keep track of used filter-props f0-f8
		let used = {};
		let idx = 0;
		let boxen = this.boxen;
		let filters = [];
		if (!$('disableothers').checked) {
			for (let i = 0, e = boxen.length; i < e; ++i) {
				let box = boxen[i];
				if (!box.checked) {
					continue;
				}
				filters.push(box.filter);
			}
		}
		let fast = null;
		try {
			if (this.ddFilter.value) {
				fast = FilterManager.getTmpFromString(this.ddFilter.value);
			}
		}
		catch (ex) {
			// no op
		}

		for each (let link in tree._links) {
			link.checked = '';
			if (link.manuallyChecked) {
				link.checked = 'manuallySelected';
				continue;
			}
			if (fast && (fast.match(link.url.usable) || fast.match(link.desc))) {
				link.checked = 'fastFiltered';
				continue;
			}
			filters.some(
				function(f) {
					if (!f.match(link.url.usable)) {
						return false;
					}
					let i;

					// see if we already assigned a prop to that filter.
					if (f.id in used) {
						i = used[f.id];
					}
					else {
						i = idx = (idx + 1) % 8;
						used[f.id] = i;
					}
					link.checked = 'f' + i;
					return true;
				},
				this
			);
		}

		// need to invalidate our tree so that it displays the selection
		tree.invalidate();
	},

	// called whenever a filter is en/disabled
	toggleBox: function(box) {

		// whoops, somebody called us that has no filter attached
		if (!('filter') in box) {
			log(LOG_ERROR, "toggleBox: invalid element");
			return;
		}

		// alright, need to overthink our selection
		this.makeSelection();
	},

	// will check/uncheck/invert the currently selected links
	toggleSelection: function () {

		// modes: 1 = check, 2 = uncheck, other = invert
		let mode = 0;
		if (arguments && arguments.length) {
			mode = arguments[0] ? 1 : 2;
		}
		let tree = this.current;

		let rangeCount = tree.selection.getRangeCount();
		let start = {}, end = {}, val;
		for (let r = 0; r < rangeCount; ++r) {
			tree.selection.getRangeAt(r, start, end);
			for (let i = start.value; i <= end.value; ++i) {
				switch (mode) {
					// calling setCellValue with a null column will prevent the box from
					// invalidating
					// note, that
					case 1:
						tree.setCellValue(i, null, 'true');
					break;
					case 2:
						tree.setCellValue(i, null, 'false');
					break;
					default:
						val = tree.getCellValue(i);
						val = val == 'true' ? 'false' : 'true';
						tree.setCellValue(i, null, val);
					break;
				}
			}
		}

		// alright, like always our tree needs an update.
		tree.invalidate();
	},

	changeTab: function (tab) {
		// BEWARE: Other functions will call us to reinitalize the filters/selection
		// first of all: remember the currently selected/displayed tab
		if (this.current) {
			this.current.removeSortMarker();
		}
		this.current = this[tab];
		this.current.tab = tab;

		// ... and set it to the actual tree
		$("urlList").view = this.current;
		this.current.setSortMarker();

		// ... and update the UI
		let type = this.current.type;
		if (type == 1) {
			$("viewlinks").setAttribute("selected", true);
			$("viewpics").setAttribute("selected", false);
		}
		else {
			$("viewlinks").setAttribute("selected", false);
			$("viewpics").setAttribute("selected", true);
		}

		let boxes = [];
		for (let f in FilterManager.enumAll()) {
			if (!(f.type & type)) {
				continue;
			}
			let checkbox = document.createElement("checkbox");
			checkbox.setAttribute("checked", f.active);
			checkbox.setAttribute("id", f.id);
			checkbox.setAttribute("label", f.label);
			checkbox.setAttribute("crop", "end");
			checkbox.addEventListener('command', function(evt) Dialog.toggleBox(evt.target), true);
			checkbox.filter = f;
			boxes.push(checkbox);
		}

		// clean all filterboxen
		let rows = $('checkcontainerrows');
		let cols = $('checkcontainercols');
		while (rows.hasChildNodes()) {
			rows.removeChild(rows.lastChild);
		}
		while (cols.hasChildNodes()) {
			cols.removeChild(cols.lastChild);
		}
		let count = boxes.length;
		for (let i = 0; i < 3; ++i) {
			cols.appendChild(document.createElement('column'));
			cols.lastChild.setAttribute('flex', '1');
		}

		let row = null;
		boxes.forEach(
			function(b, i) {
				if (i % 3 == 0) {
					row = document.createElement('row');
					row.setAttribute('pack', 'center');
					rows.appendChild(row);
				}
				row.appendChild(b);
			}
		);
		// update selection
		this.makeSelection();
	},

	// browse for a dest directory
	browseDir: function() {

		// get a new directory
		let newDir = Utils.askForDir(
			this.ddDirectory.value, // initialize dialog with the current directory
			_("validdestination")
		);
		// alright, we got something new, so lets set it.
		if (newDir) {
			this.ddDirectory.value = newDir;
		}
	},

	// initialized the popup
	showPopup: function() {

		let items = $('popup').getElementsByTagName('menuitem');
		let open = $('mopen');
		let tree = this.current;

		const hideItems = tree.selection.count == 0;
		$('mopen', 'mcheck', 'muncheck', 'mtoggle', 'mrenaming', 'msep1', 'msep2', 'msep3').forEach(
			function(e) {
				e.setAttribute('hidden', hideItems);
			}
		);

		let otext = '';
		if (tree.selection.count == 1) {
			let s = {}, e = {};
			tree.selection.getRangeAt(0, s, e);
			let l = tree._links[s.value];
			otext = _("openlink", [l.url.url.spec]);
		}
		else {
			otext = _("openlinks", [tree.selection.count]);
		}
		open.setAttribute("label", otext);
		// display the popup
		return true;
	},

	// will open the curretly selected links in new tabs
	openSelection: function() {
		let tree = this.current;
		let rangeCount = tree.selection.getRangeCount();
		let start = {}, end = {}, val;
		for (let r = 0; r < rangeCount; ++r) {
			tree.selection.getRangeAt(r, start, end);
			for (let i = start.value; i <= end.value; ++i) {
				openUrl(tree._links[i].url.url, tree._links[i].referrer);
			}
		}
	},

	selectAll: function() {
		this.current.selection.selectAll();
	},
	invertSelection: function() {
		// this.current.selection.invertSelection();
		// not implemented :p
		let tree = this.current;
		let selection = tree.selection;
		for (let i = 0, e = tree.rowCount; i < e; ++i) {
			selection.toggleSelect(i);
		}
	},
	selectFiltered: function() {
		let tree = this.current;
		let selection = tree.selection;
		selection.clearSelection();
		for (let i = 0, e = tree.rowCount; i < e; ++i) {
			if (tree.isChecked(i)) {
				selection.rangedSelect(i, i, true);
			}
		}
	},
	// nsIObserver::observe
	observe : function(subject, topic, prefName) {
		// filterManager will throw this topic at us.
		if (topic == 'DTA:filterschanged') {
			// the heavy work will be performed by changeTab..
			// it will create the filter boxen for us, and furthermore do another
			// selection
			this.changeTab(this.current.tab);
		}
	},
	// register ourselves
	// * filterManager
	registerObserver: function() {
		Preferences.makeObserver(this);
		Services.obs.addObserver(this, 'DTA:filterschanged', true);
	}
};
