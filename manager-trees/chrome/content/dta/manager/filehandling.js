var FileHandling = {
	openFolder: function() {
		for (d in tree.selected) {
			try {
				if (d.is(COMPLETE)) {
					OpenExternal.reveal(d.dirSave + d.destinationName);
				} else {
					OpenExternal.reveal(d.dirSave);
				}
			} catch (ex) {
				Debug.dump('reveal', ex);
			}
		}
	},
	openFile: function() {
		var cur = tree.current;
		if (cur && cur.is(COMPLETE)) {
			try {
				OpenExternal.launch(cur.dirSave + cur.destinationName);
			}
			catch (ex) {
				Debug.dump('launch', ex);
			}
		}
	},
	deleteFile: function() {
		var list = [];
		
		for (d in tree.selected) {
			if (d.is(COMPLETE)) {
				var file = new FileFactory(d.dirSave + d.destinationName);
				if (file.exists()) {
					if (!DTA_confirm(_('deletetitle'), _('deletetext', [file.leafName]), _('delete'), DTA_confirm.CANCEL, null, 1)) {
						file.remove(false);
						list.push(d);
					}
				}
			}
			else {
				list.push(d);
			}
		}
		if (list.length) {
			tree.remove(list);
		}
	}
};