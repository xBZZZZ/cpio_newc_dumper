# cpio_newc_dumper.js
Use it to dump (not properly extract directory tree with permissions!) an ASCII cpio archive (SVR4 with no CRC).

Search <q cite="https://manpages.ubuntu.com/manpages/jammy/en/man5/cpio.5.html"><b>New ASCII Format</b></q> [here](https://manpages.ubuntu.com/manpages/jammy/en/man5/cpio.5.html) for explanation of archive format.

It is intended for editing ASCII cpio archives (SVR4 with no CRC) with minimal changes.<details><summary>It <em>almost</em> perfectly replicates original achive from dump:</summary><table><tr><td>Archive  is ungzipped `ramdisk.img` from [`primeOS-mainline_0.6.1-20211206.iso`](https://sourceforge.net/projects/primeos/files/Mainline/primeOS-mainline_0.6.1-20211206.iso/download).<br/>The zeros in the `diff`erence are garbage data after the `TRAILER!!!` file in original ungzipped archive (`ramdisk`).</td></tr><tr><td><pre>bash&#45;5.1$ zcat ramdisk.img &#62; ramdisk
bash&#45;5.1$ mkdir dumpdir
bash&#45;5.1$ deno run &#45;&#45;allow&#45;read &#45;&#45;allow&#45;write cpio&#95;newc&#95;dumper.js dump ramdisk dumpdir
bash&#45;5.1$ deno run &#45;&#45;allow&#45;read &#45;&#45;allow&#45;write cpio&#95;newc&#95;dumper.js pack ramdisk2 dumpdir
bash&#45;5.1$ diff &#60;&#40;xxd ramdisk&#41; &#60;&#40;xxd ramdisk2&#41;
271681,271696c271681
&#60; 00425400: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425410: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425420: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425430: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425440: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425450: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425460: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425470: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425480: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 00425490: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 004254a0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 004254b0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 004254c0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 004254d0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 004254e0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#60; 004254f0: 0000 0000 0000 0000 0000 0000 0000 0000  ................
&#45;&#45;&#45;
&#62; 00425400: 0000 0000                                ....</pre></td></tr></table></details>
What it doesn't replicate:
* data after `TRAILER!!!` file
* case of hex letters (`ABCDEF` or `abcdef`) in headers
	* It understands both uppercase (`0123456789ABCDEF`) and lowercase (`0123456789abcdef`) hex digits but writes lowercase hex digits.
---
```
usage: deno run --allow-read --allow-write THIS_SCRIPT MODE ARCHIVE DUMP_DIR

MODE is case-insensitive and means what to do:
  "dump"    dump ARCHIVE into DUMP_DIR
            ARCHIVE is "-" means stdin
  "dumpgz"  ungzip and dump ARCHIVE into DUMP_DIR
            ARCHIVE is "-" means stdin
  "pack"    pack DUMP_DIR into ARCHIVE
            ARCHIVE is "-" means stdout
  "packgz"  pack and gzip DUMP_DIR into ARCHIVE
            ARCHIVE is "-" means stdout

DUMP_DIR contains non-empty files (symlinks is dumped as files with link target as content) and "table.txt".
"table.txt" contains file names from ARCHIVE and names of corresponding files in DUMP_DIR and numbers from cpio_newc_header struct.

I am not a cpio extractor that keeps file names and directory structure!
I am a tool to dump and pack newc cpio ("file" calls it "ASCII cpio archive (SVR4 with no CRC)") archives.
See https://manpages.ubuntu.com/manpages/jammy/en/man5/cpio.5.html "New ASCII Format".
```