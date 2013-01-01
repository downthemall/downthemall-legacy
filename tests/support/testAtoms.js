module("support/atoms.js");

test("exports", function() {
	checkExports("support/atoms", [
		"Atoms",
		"iconicAtom",
		"completedAtom",
		"inprogressAtom",
		"pausedAtom",
		"privateAtom",
		"canceledAtom",
		"pausedUndeterminedAtom",
		"pausedAutoretryingAtom",
		"verifiedAtom",
		"progressAtom"
		]);
});

test("getAtoms", function() {
	var Atoms = new (require("support/atoms").Atoms)();
	ok(Atoms.getAtom("foobar"), "can get atom");
	strictEqual(Atoms.getAtom("foobar"), Atoms.getAtom("foobar"), "getting twice yields the same atom");
	equal(Atoms.getAtom("foobar").toString(), "foobar", "toString works");

	var Atoms2 = new (require("support/atoms").Atoms)();
	strictEqual(Atoms.getAtom("foobar"), Atoms2.getAtom("foobar"), "getting twice by different instances yields the same atom");
});
