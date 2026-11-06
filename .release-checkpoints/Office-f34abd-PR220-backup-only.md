# Temporary release recovery gate

Current protected Main SHA `f34abd909591a5908da54940e483dd8d9fe8b093`.

The source-recovery workflow must check out **Main** and verify a restorable full Git-history bundle plus complete source archive. This administrative PR must be closed without merge. The production UI, SQL, rules, Audit module and payment logic must not be changed by this checkpoint.
