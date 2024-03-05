//Use https://github.com/denoland/deno to run me.

class CPIOFile{
	set_header(h){
		h=header_re.exec(h)
		if(!h)throw Error('bad header')
		this.c_ino=      parseInt(h[1],16)
		this.c_mode=     parseInt(h[2],16)
		this.c_uid=      parseInt(h[3],16)
		this.c_gid=      parseInt(h[4],16)
		this.c_nlink=    parseInt(h[5],16)
		this.c_mtime=    parseInt(h[6],16)
		this.c_filesize= parseInt(h[7],16)
		this.c_devmajor= parseInt(h[8],16)
		this.c_devminor= parseInt(h[9],16)
		this.c_rdevmajor=parseInt(h[10],16)
		this.c_rdevminor=parseInt(h[11],16)
		this.c_namesize= parseInt(h[12],16)
		if(!this.c_namesize)throw Error('c_namesize = 0')
	}
	set_name(name){
		if(this.c_namesize-1!==name.indexOf('\0'))throw Error('bad name')
		this.name=name=name.slice(0,-1)
		if(this.c_filesize){
			const n=`${name.slice(name.lastIndexOf('/')+1).replace(dump_re,'')}.${this.c_ino}.${this.c_rdevmajor}.${this.c_rdevminor}.df`
			let i=0
			while(n.charAt(i)==='.')++i
			this.dump_name=n.slice(i)
		}else this.dump_name='.'
	}
	unique_bigint(){
		let x=BigInt(this.c_ino)
		if(this.c_devminor)x|=BigInt(this.c_devminor)<<24n
		if(this.c_devmajor)x|=BigInt(this.c_devmajor)<<48n
		return x
	}
}

class CPIOReader{
	constructor(readablestream){
		this.sr=readablestream.getReader()
		this.overread=null
	}
	async read_str(size){
		let out='',chunk=this.overread
		if(chunk){
			if(chunk.length>size){
				this.overread=chunk.subarray(size)
				return String.fromCharCode.apply(null,chunk.subarray(0,size))
			}
			this.overread=null
			size-=chunk.length
			out=String.fromCharCode.apply(null,chunk)
		}
		while(size){
			chunk=await this.sr.read()
			if(chunk.done)throw Error('unexpected end of stream')
			chunk=chunk.value
			const chunk_size=chunk.length
			if(chunk_size>size){
				this.overread=chunk.subarray(size)
				return out+String.fromCharCode.apply(null,chunk.subarray(0,size))
			}
			size-=chunk_size
			out+=String.fromCharCode.apply(null,chunk)
		}
		return out
	}
	async read_to_file(size,name){
		const outfile=await Deno.open(name,open_w)
		let chunk=this.overread,write_promise
		if(chunk){
			if(chunk.length>size){
				this.overread=chunk.subarray(size)
				await file_write_all(outfile,chunk.subarray(0,size))
				outfile.close()
				return
			}
			this.overread=null
			size-=chunk.length
			write_promise=file_write_all(outfile,chunk)
		}
		while(size){
			chunk=await this.sr.read()
			if(chunk.done)throw Error('end of stream')
			chunk=chunk.value
			if(write_promise)await write_promise
			const chunk_size=chunk.length
			if(chunk_size>size){
				this.overread=chunk.subarray(size)
				write_promise=file_write_all(outfile,chunk.subarray(0,size))
				break
			}
			size-=chunk_size
			write_promise=file_write_all(outfile,chunk)
		}
		if(write_promise)await write_promise
		outfile.close()
	}
	async read_padding(size){
		let chunk=this.overread,chunk_size
		if(chunk){
			chunk_size=chunk.length
			if(chunk_size>=size){
				this.overread=chunk_size>size?chunk.subarray(size):null
				while(size)if(chunk[--size])throw Error('non zero padding')
				return
			}
			size-=chunk_size
			while(chunk_size)if(chunk[--chunk_size])throw Error('non zero padding')
		}
		while(size){
			chunk=await this.sr.read()
			if(chunk.done)throw Error('end of stream')
			chunk=chunk.value
			chunk_size=chunk.length
			if(chunk_size>size){
				this.overread=chunk.subarray(size)
				while(size)if(chunk[--size])throw Error('non zero padding')
				return
			}
			size-=chunk_size
			while(chunk_size)if(chunk[--chunk_size])throw Error('non zero padding')
		}
	}
	async dump_files(){
		const used=new Set(),files=[]
		let x
		for(;;){
			const file=new CPIOFile()
			file.set_header(await this.read_str(HEADER_SIZE))
			const unique_bigint=file.unique_bigint()
			if(used.has(unique_bigint))throw Error('duplicate INO, DEVMAJOR, DEVMINOR')
			file.set_name(await this.read_str(file.c_namesize))
			if(x=(HEADER_SIZE_MOD_4+file.c_namesize)%4)await this.read_padding(4-x)
			if(file.c_filesize){
				used.add(unique_bigint)
				await this.read_to_file(file.c_filesize,file.dump_name)
				if(x=file.c_filesize%4)await this.read_padding(4-x)
			}
			files.push(file)
			if(file.name==='TRAILER!!!'){
				await this.sr.cancel()
				return files
			}
		}
	}
}

const HEADER_SIZE=110,
HEADER_SIZE_MOD_4=HEADER_SIZE%4,
READ_BUF_SIZE=1024*1024,//1MB
open_w={'read':false,'write':true,'create':true},
file_write_all=async(file,buf)=>{
	while(buf.length)buf=buf.subarray(await file.write(buf))
},
header_re=RegExp(`^070701${'([0-9A-Fa-f]{8})'.repeat(12)}0{8}$`),
format_table=(row_item_count,spacing,items)=>{
	const col_sizes=new Uint32Array(row_item_count),len=items.length
	let out='',i=len
	while(i){
		const item_len=items[--i].length,col=i%row_item_count
		if(item_len>col_sizes[col])col_sizes[col]=item_len
	}
	i=row_item_count
	while(i)col_sizes[--i]+=spacing
	while(i<len){
		out+=(i+1)%row_item_count?items[i].padEnd(col_sizes[i%row_item_count]):items[i]+'\n'
		++i
	}
	return out
},
dump_re=RegExp('[^-.0-9A-Z_a-z]','g'),
esc_re=RegExp('[^!"$&-~]','g'),esc_replacer=c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0'),
unesc_re=RegExp('%([0-9A-Fa-f]{0,2})','g'),unesc_replacer=(_,h)=>{
	if(h.length!==2)throw Error('invalid uri escape')
	return String.fromCharCode(parseInt(h,16))
},
parse_int_hex8=(str,max_hex_length)=>{
	const x=Number(str)
	if(x>=0&&x<=0xffffffff&&Number.isSafeInteger(x))return x
	throw Error('bad number: '+str)
},
spaces_re=RegExp('[ \\t]+'),
parse_table=table=>{
	table=table.split('\n')
	const l=table.length,used=new Set()
	let i=0,j=0
	while(j<l){
		let line=table[j++]
		try{
			if(!line||line.charAt(0)==='#')continue
			line=line.split(spaces_re)
			if(line.length!==12)throw Error(`table: invalid number of words in line (expected 12, got ${line.length})`)
			const f=table[i++]=new CPIOFile()
			f.name=encodeURIComponent(line[0]).replace(unesc_re,unesc_replacer).replace(unesc_re,unesc_replacer)
			f.dump_name=decodeURIComponent(line[1])
			f.c_ino=parse_int_hex8(line[2])
			f.c_mode=parse_int_hex8(line[3])
			f.c_uid=parse_int_hex8(line[4])
			f.c_gid=parse_int_hex8(line[5])
			f.c_nlink=parse_int_hex8(line[6])
			f.c_mtime=parse_int_hex8(line[7])
			f.c_devmajor=parse_int_hex8(line[8])
			f.c_devminor=parse_int_hex8(line[9])
			f.c_rdevmajor=parse_int_hex8(line[10])
			f.c_rdevminor=parse_int_hex8(line[11])
			f.c_namesize=f.name.length+1
			if(f.c_namesize>0xffffffff)throw Error('table: NAME too big')
			const unique_bigint=f.unique_bigint()
			if(used.has(unique_bigint))throw Error('table: duplicate INO, DEVMAJOR, DEVMINOR')
		}catch(error){
			throw Error(`table: failed to parse line ${j}`,{'cause':error})
		}
	}
	table.length=i
	return table
},
hex8=num=>num.toString(16).padStart(8,'0'),
file_for_reading=name=>name==='-'?Deno.stdin:Deno.openSync(name),
file_for_writing=name=>name==='-'?Deno.stout:Deno.openSync(name,open_w)

if(Deno.args.length===3){
	let gz=false
	switch(Deno.args[0].toLowerCase()){
		case 'dumpgz':
			gz=true
		case 'dump':{
			let files=file_for_reading(Deno.args[1]).readable
			Deno.chdir(Deno.args[2])
			if(gz)files=files.pipeThrough(new DecompressionStream('gzip'))
			files=await new CPIOReader(files).dump_files()
			const len=files.length,table=[
				'#NAME',
				'DUMP_NAME',
				'INO',
				'MODE',
				'UID',
				'GID',
				'NLINK',
				'MTIME',
				'DEVMAJOR',
				'DEVMINOR',
				'RDEVMAJOR',
				'RDEVMINOR'
			]
			let i=0
			while(i<len){
				const f=files[i++]
				table.push(
					f.name.replace(esc_re,esc_replacer),//NAME
					f.dump_name,//DUMP_NAME
					f.c_ino.toString(10),//INO
					'0o'+f.c_mode.toString(8).padStart(6,'0'),//MODE
					f.c_uid.toString(10),//UID
					f.c_gid.toString(10),//GID
					f.c_nlink.toString(10),//NLINK
					f.c_mtime.toString(10),//MTIME
					f.c_devmajor.toString(10),//DEVMAJOR
					f.c_devminor.toString(10),//DEVMINOR
					f.c_rdevmajor.toString(10),//RDEVMAJOR
					f.c_rdevminor.toString(10)//RDEVMINOR
				)
			}
			Deno.writeTextFileSync('table.txt',`\
#empty or starting with "#" lines are ignored
#DUMP_NAME is dumped file's name in location of myself ("table.txt" file)
#NAME and DUMP_NAME are uri escaped (%XX hex escape)
#DUMP_NAME is "." means empty file
#see https://manpages.ubuntu.com/manpages/noble/en/man5/cpio.5.html

${format_table(12,2,table)}`)
			Deno.exit(0)
		}
		case 'packgz':
			gz=true
		case 'pack':{
			let outstream=file_for_writing(Deno.args[1]).writable,gz_pipe_promise
			if(gz){
				const c=new CompressionStream('gzip')
				gz_pipe_promise=c.readable.pipeTo(outstream)
				outstream=c.writable
			}
			outstream=outstream.getWriter()
			Deno.chdir(Deno.args[2])
			const table=parse_table(Deno.readTextFileSync('table.txt')),len=table.length
			let i=0,padding_debt=0,bufindex=0,bufs=new Uint8Array(READ_BUF_SIZE*2)
			bufs=[bufs.subarray(0,READ_BUF_SIZE),bufs.subarray(READ_BUF_SIZE)]
			while(i<len){
				const f=table[i++]
				let file,filesize=0,seek_promise
				if(f.dump_name!=='.'){
					file=await Deno.open(f.dump_name)
					filesize=await file.seek(0,2)
					if(filesize>0xffffffff)throw Error(`${f.dump_name} is bigger than 0xffffffff bytes`)
					if(filesize)seek_promise=file.seek(0,0)
					else file.close()
				}
				const h=`070701${
					hex8(f.c_ino)}${
					hex8(f.c_mode)}${
					hex8(f.c_uid)}${
					hex8(f.c_gid)}${
					hex8(f.c_nlink)}${
					hex8(f.c_mtime)}${
					hex8(filesize)}${
					hex8(f.c_devmajor)}${
					hex8(f.c_devminor)}${
					hex8(f.c_rdevmajor)}${
					hex8(f.c_rdevminor)}${
					hex8(f.c_namesize)}00000000${f.name}`
				let i2=h.length
				const hu=new Uint8Array(padding_debt+Math.ceil((i2+1)/4)*4)
				while(i2)hu[--i2+padding_debt]=h.charCodeAt(i2)
				let write_promise=outstream.write(hu)
				if(filesize){
					if(padding_debt=filesize%4)padding_debt=4-padding_debt
					await seek_promise
					do{
						const read_amt=await file.read(filesize<READ_BUF_SIZE?bufs[bufindex].subarray(0,filesize):bufs[bufindex])
						if(!read_amt){
							if(read_amt===null)throw Error('unexpected end of file')
							continue
						}
						await write_promise
						write_promise=outstream.write(read_amt<READ_BUF_SIZE?bufs[bufindex].subarray(0,read_amt):bufs[bufindex])
						bufindex^=1
						filesize-=read_amt
					}while(filesize)
					file.close()
				}else padding_debt=0
				await write_promise
			}
			if(padding_debt)await outstream.write(new Uint8Array(padding_debt))
			await outstream.close()
			if(gz)await gz_pipe_promise
			Deno.exit(0)
		}
	}
}
console.log(`\
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

some ARCHIVE and DUMP_DIR names won't work, example (bash):
  deno run --allow-read --allow-write cpio_newc_dumper.js dump $'\\xee.cpio' asd`)
Deno.exit(2)
