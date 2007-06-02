var FileHandling = {
	openFolder: function() {
		for (d in tree.selected) {
			try {
				if (d.is(COMPLETE)) {
					OpenExternal.reveal(d.destinationFile);
				} else {
					OpenExternal.reveal(d.destinationPath);
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
				OpenExternal.launch(cur.destinationFile);
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
				var file = new FileFactory(d.destinationFile);
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