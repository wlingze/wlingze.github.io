(window.webpackJsonp=window.webpackJsonp||[]).push([[40],{443:function(s,t,a){"use strict";a.r(t);var e=a(21),r=Object(e.a)({},(function(){var s=this,t=s.$createElement,a=s._self._c||t;return a("ContentSlotsDistributor",{attrs:{"slot-key":s.$parent.slotKey}},[a("h2",{attrs:{id:"tctf2020-flash"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#tctf2020-flash"}},[s._v("#")]),s._v(" tctf2020-flash")]),s._v(" "),a("p",[s._v("首先给了两个文件，一个二进制文件和一个run.sh文件，看下其中的内容：")]),s._v(" "),a("div",{staticClass:"language-bash line-numbers-mode"},[a("pre",{pre:!0,attrs:{class:"language-bash"}},[a("code",[a("span",{pre:!0,attrs:{class:"token shebang important"}},[s._v("#! /bin/sh")]),s._v("\n\n\nqemu-system-mips -M mips -bios ./flash -nographic -m 16M -monitor /dev/null "),a("span",{pre:!0,attrs:{class:"token operator"}},[a("span",{pre:!0,attrs:{class:"token file-descriptor important"}},[s._v("2")]),s._v(">")]),s._v("/dev/null\n\n")])]),s._v(" "),a("div",{staticClass:"line-numbers-wrapper"},[a("span",{staticClass:"line-number"},[s._v("1")]),a("br"),a("span",{staticClass:"line-number"},[s._v("2")]),a("br"),a("span",{staticClass:"line-number"},[s._v("3")]),a("br"),a("span",{staticClass:"line-number"},[s._v("4")]),a("br"),a("span",{staticClass:"line-number"},[s._v("5")]),a("br")])]),a("p",[s._v("可以看到是一个mips 构架下的bios文件，bios文件从文件开头第一句开始运行，")]),s._v(" "),a("h2",{attrs:{id:"分析调试环境"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#分析调试环境"}},[s._v("#")]),s._v(" 分析调试环境")]),s._v(" "),a("p",[s._v("ida载入分析， 选择mips-big，")]),s._v(" "),a("div",{staticClass:"custom-block tip"},[a("p",{staticClass:"custom-block-title"},[s._v("tip")]),s._v(" "),a("p",[s._v("qemu对mips的构架有四种，64/32 + big/small， 其中默认qemu-system-mips为32位大端， 64位标注64, 小段后缀l，")])]),s._v(" "),a("p",[s._v("调试使用gdb，这里可以自己编译一个比较新版本的gdb并指定"),a("code",[s._v("--target=mips")]),s._v("选项，也可以直接安装"),a("code",[s._v("gdb-multiarch")]),s._v(", 在archcn源是有这个的，然后使用这个gdb运行并attach调试即可，")]),s._v(" "),a("p",[s._v("在"),a("code",[s._v("run.sh")]),s._v("文件里加入"),a("code",[s._v("-s")]),s._v("选项，表示给出一个gdbserver的端口， 配合gdb进行调试，")]),s._v(" "),a("p",[s._v("这时候我们使用gdb载入进去，设置构架和大小端， "),a("code",[s._v("target")]),s._v("指定附加即可。gdb中命令：")]),s._v(" "),a("div",{staticClass:"language-bash line-numbers-mode"},[a("pre",{pre:!0,attrs:{class:"language-bash"}},[a("code",[a("span",{pre:!0,attrs:{class:"token builtin class-name"}},[s._v("set")]),s._v(" architecture mips\n"),a("span",{pre:!0,attrs:{class:"token builtin class-name"}},[s._v("set")]),s._v(" endian big \ntarget remote "),a("span",{pre:!0,attrs:{class:"token number"}},[s._v("0.0")]),s._v(".0.0:1234\n")])]),s._v(" "),a("div",{staticClass:"line-numbers-wrapper"},[a("span",{staticClass:"line-number"},[s._v("1")]),a("br"),a("span",{staticClass:"line-number"},[s._v("2")]),a("br"),a("span",{staticClass:"line-number"},[s._v("3")]),a("br")])]),a("h2",{attrs:{id:"分析和调试"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#分析和调试"}},[s._v("#")]),s._v(" 分析和调试")]),s._v(" "),a("h3",{attrs:{id:""}},[a("a",{staticClass:"header-anchor",attrs:{href:"#"}},[s._v("#")])]),s._v(" "),a("p",[s._v("首先在ida里默认基地址00000, 第一句开始运行，识别为代码， 是个跳转：")]),s._v(" "),a("p",[a("img",{attrs:{src:"https://i.loli.net/2020/07/25/hlwFSQsdvq86uBx.png",alt:""}})]),s._v(" "),a("p",[s._v("可以判断出基地址大概应该是0xfc0000, 于是可以直接看到运行到的位置，")]),s._v(" "),a("p",[a("img",{attrs:{src:"https://i.loli.net/2020/07/25/F3SyEUTbHj57uWJ.png",alt:""}})]),s._v(" "),a("p",[s._v("然后到这个位置，可以看到0xbfc01550， 在后面jal进入的函数内也有0xbfc00000的地址， 猜测可能基地址是0xbfc0000，设置以后开始蹦出来很多函数了，")]),s._v(" "),a("p",[s._v("然后分析最后设置的一句jal指令对应的函数如下：\n"),a("img",{attrs:{src:"/home/wlz/.config/Typora/typora-user-images/image-20200725155012079.png",alt:"image-20200725155012079"}})]),s._v(" "),a("p",[s._v("这是个挺关键的函数，")])])}),[],!1,null,null,null);t.default=r.exports}}]);