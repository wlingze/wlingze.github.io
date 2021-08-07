---
title: memlab
date: 2021-08-07 14:15:06
permalink: /pages/d527ec/
categories:
  - labbb
  - memlab
tags:
  - 
---
# memlab 

[[toc]]

一个关于取证的ctf题目集合, [github](https://github.com/stuxnet999/MemLabs). 

## 工具安装

最主要的工具就是volatility, 是python2运行的工具, 注意使用的时候使用对应的python, 

其实这个工具现在有volatility3, 为兼容python3的版本, 但是相关插件等不够多, 所以现在还是用python2的版本多一些,

下载代码: 

 ```sh
 git clone https://github.com/volatilityfoundation/volatility.git
 cd volatility
 ```

可以先运行一下, 查看缺少的库, 

```sh
python vol.py 
```

安装必须的库:

```sh
pip2 install pycrypto
pip2 install distorm3
# 这个是为了mimikatz插件
pip2 install construct==2.5.5-reupload
```

安装一个比较实用的第三方插件, [mimikatz](https://github.com/RealityNet/hotoloti/blob/master/volatility/mimikatz.py), 放到`./volatility/plugins`内, 

```sh
sudo python2 setup.py install
```

安装成功的话运行`vol.py -h`会有输出内容.

## 使用

一般是使用如下的命令, 其中FILE是我们的内存映像文件, XXX表示对应的文件类型, 我们通过imageinfo指令获取类型以后指定对应类型来进行后续的分析, command是指令, 一般是调用volalitity中的内置或外部插件, 

```
vol.py -f FILE --profile=XXX  command
```

### imageinfo 

分析映像文件的文件类型, 使用如下:

```
vol -f FILE imageinfo
```



上面示例的话是可以得到对应的profile为`Win7SP1x86`, 于是可以进行后续的操作, 

后续一般情况下在分析过程中, 我们会关注的几个部分:

* 活动进程
* 终端下运行的指令
* 隐藏的进程或者退出的进程
* 浏览器历史记录

### pslist

一般需要注意的是, 

* 命令行工具
* 资源管理器

### cmdscan

非常强大的功能, 会查找出输入到cmd.exe中运行的指令, 包括某些攻击者从后门传入的指令, 

实现原理是查找csrss.exe和conhost.exe的内存, 查找`CONSOLE_HISTORY`获取历史指令.

### consoles

打印所有控制台上的输入输出,其实和cmdscan类似, 但是这个功能会扫描`CONSOLE_INFORMATION`, 他会收集当时的整个屏幕缓冲区, 

> 打印当时整个屏幕信息, 不仅打印输入的数据, 还会打印对应的输出等,

此外还会获取运行指令的相关信息和某些别名等, 

> 比如攻击者会定义别名来隐藏自己的时候



### mftparser

会解析整个文件结构,然后打印所有的文件, 一般来说我们会配合`grep -C `一起使用,

### mimikatz

获取windows内的密码信息, 

其中这个密码使用hash储存起来, mimikatz插件实现了对这个hash的爆破,

### envars

获取系统内的环境变量

## memlab0

获取信息, 是win732位, 

然后在consoles中发现了`C:\Python27\python.exe C:\Users\hello\Desktop\demon.py.txt `指令, 

然后通过mftparser查找到文件内容:

```
$DATA
0000000000: 61 20 3d 20 22 31 5f 34 6d 5f 62 33 74 74 33 72   a.=."1_4m_b3tt3r
0000000010: 7d 22 0d 0a 0d 0a 62 20 3d 20 22 22 0d 0a 0d 0a   }"....b.=.""....
0000000020: 66 6f 72 20 69 20 69 6e 20 61 3a 0d 0a 20 20 20   for.i.in.a:.....
0000000030: 20 62 20 3d 20 62 20 2b 20 63 68 72 28 6f 72 64   .b.=.b.+.chr(ord
```

可以看到前一半flag, 

然后envars中有这么一项:

```
    2424 conhost.exe          0x002934b0 Thanos                         xor and password
```

于是使用mimikatz找到密码:

```
wdigest  hello            hello-PC         flag{you_are_good_but  
```

得到完整flag, 

## memlab1 

题目描述是有三个flag的, 其中关键信息是, 有一个flag在某个画图程序内, 

### 基本信息

首先检测系统信息, 是win7 x64

然后pslist, cmdline, consoles, 




### flag1

在consoles中发现这个

```
----
Screen 0x1e0f70 X:80 Y:300
Dump:
Microsoft Windows [Version 6.1.7601]                                            
Copyright (c) 2009 Microsoft Corporation.  All rights reserved.                 
                                                                                
C:\Users\SmartNet>St4G3$1                                                       
ZmxhZ3t0aDFzXzFzX3RoM18xc3Rfc3Q0ZzMhIX0=                                        
Press any key to continue . . .        
```

看起来是个base64, 解码得到一个flag

```
$ echo "ZmxhZ3t0aDFzXzFzX3RoM18xc3Rfc3Q0ZzMhIX0=" | base64 -d 
flag{th1s_1s_th3_1st_st4g3!!}

```

### flag2

在cmdline中发现正在rar压缩这个important.rar, 

```
WinRAR.exe pid:   1512
Command line : "C:\Program Files\WinRAR\WinRAR.exe" "C:\Users\Alissa Simpson\Documents\Important.rar"
************************************************************************
```

提取出来文件
![image-20210730191506535](https://i.loli.net/2021/07/30/asnlphGb1TKRvim.png)

解压, 要求输入对应的hash值, 且注意要大写, `F4FF64C8BAAC57D22F22EDC681055BA6`

![image-20210730192043760](https://i.loli.net/2021/07/30/nhqZQ7oV6jGOaM2.png)

解压成功会得到一个图片flag, 

![image-20210730192221589](https://i.loli.net/2021/07/30/HcC2NjifLudnSBE.png)

flag{w3ll_3rd_stage_was_easy}

### flag3

然后题目提示中的正在写字, 同时看到进程`mspaint.exe`, 应该就是在里面写字了, dump出文件, 然后使用gimp调整可以看到一个反向的图片, 倒过来就好了, 

![image-20210730195248593](https://i.loli.net/2021/07/30/JcVb9lH13PwOaEs.png)

## memlab2 

题目提示说环境变量相关的操作, 

在envars中找到了一个奇怪的字符串, base64解密是flag, 

![image-20210730214848179](https://i.loli.net/2021/07/30/kDcegt2mPuy8W6I.png)

`flag{w3lc0m3_T0_$T4g3_!_Of_L4B_2}`



然后提到密码管理器和浏览器, 

在进程中可以看到keepasword和chrome, 

dump出来chrome历史文件, 并在线sqllite解析出url, 或者直接使用chromehistory的第三方插件,

可以知道获得到一个mega地址, 然后下载下来一个important.zip, 

![image-20210730215210305](https://i.loli.net/2021/07/30/efl8Mz7PjJ64WvR.png)

他需要一个lab1 的flag , 

![image-20210730215435755](https://i.loli.net/2021/07/30/5oF417wruQ3AfZP.png)

```
$ echo -n "flag{w3ll_3rd_stage_was_easy}" | sha1sum             
6045dd90029719a039fd2d2ebcca718439dd100a  -
```

解压开是important.png, 

![image-20210730215526800](https://i.loli.net/2021/07/30/Cun5fv1ZFk8AqPL.png)

flag{OK_So_Now_St4g3_3_is_DoNE!!}



然后另一个一点是程序内的这个Hidden.kdbx文件, 查了下是KeePass保存密码的文件, 然后用这个密码管理器打开即可,

![image-20210730215637826](https://i.loli.net/2021/07/30/KteW7YNxwuUH5kA.png)

他又需要一个password, 

在文件中查找, 正好有个Password.png, 

![image-20210730215821785](https://i.loli.net/2021/07/30/YbNpVZj6e7k1s3o.png)

其中右下角给出了password, 

![image-20210730215855076](https://i.loli.net/2021/07/30/Ga6vEDU47gJHebB.png)

然后flag在

![image-20210730220000939](https://i.loli.net/2021/07/30/4zvAgCi5qBS8ubR.png)

`flag{w0w_th1s_1s_Th3_SeC0nD_ST4g3_!!}`

## memlab3

首先常规分析, cmdline中有两个奇怪的数据, 

![image-20210730223115783](https://i.loli.net/2021/07/30/xJmVQZbguX5cO37.png) 

首先先导出了几个数据, 从python脚本分析, 

```python
import sys
import string

def xor(s):
	a = ''.join(chr(ord(i)^3) for i in s)
	return a


def encoder(x):
	return x.encode("base64")


if __name__ == "__main__":

	f = open("C:\\Users\\hello\\Desktop\\vip.txt", "w")
	arr = sys.argv[1]
	arr = encoder(xor(arr))
	f.write(arr)
	f.close()
```

写了个解密脚本, 得到第一段flag, 

```python
import base64

def xor(s):
	a = ''.join(chr(i^3) for i in s)
	return a

if __name__ == "__main__":

	s = b"am1gd2V4M20wXGs3b2U="

	s1 = base64.b64decode(s) 
	print(xor(s1))

```

`inctf{0n3_h4lf`

然后根据题目描述中反复提到的`steghide`是个处理图片隐写的工具 

`_1s_n0t_3n0ugh}`

##  memlab4 

首先检查, 发现似乎没啥东西, 然后导出文件以后发现文件列表有个`Important`文件, 

但是文件已经被删除了, 我们无法导出出来, 
![image-20210802103154691](https://i.loli.net/2021/08/02/lK27NOTc1SCvfzu.png)

这里需要了解下ntfs中的mft

> 首先, 从windows nt开始, windows使用ntfs(New Technology File System), 这是一种新的文件格式,
>
> 其中每个卷对应会有mft(Master File Table), 其中的每个文件都会对应有mft中的一项, 
>
> 文件增加的时候mft会增加对应的一项, 
>
> 文件访问的时候首先会查询mft中的对应项, 查看对应属性等,
>
> 但是文件删除的时候, mft会标记为空闲并且对应的表项可以被重复使用,但是这个内存空间不会被立刻清除, 
>
> [详细的格式](https://volatility-labs.blogspot.com/2012/10/omfw-2012-reconstructing-mbr-and-mft.html), 

于是我们可以从mft中尝试恢复这个文件, 

![image-20210802110039334](https://i.loli.net/2021/08/02/gtLICDXTpnjUzcq.png)

![image-20210802110050150](https://i.loli.net/2021/08/02/SvxAmdYBb6g1uUs.png)

于是就得到了这个文件, 其中就是flag 

`inctf{1_is_n0t_EQu4L_7o_2_bUt_th1s_d0s3nt_m4ke_s3ns3}`

## memlab5 

[[toc]]

在进程中可以看到winrar进程,然后可以发现对应的文件`SW1wb3J0YW50.rar`, 

导出出来以后解压此文件需要一个密码, 题目也说需要第一个flag才能得到第二个flag, 

于是继续分析,

最后用iehistory找到一个奇怪的文件名,然后得到对应的文件名, 是个base64 

`flag{!!_w3LL_d0n3_St4g3-1_0f_L4B_5_D0n3_!!}`

然后解压得到图片

![image-20210803213843336](https://i.loli.net/2021/08/03/rJg6Y9p7GHdfXzL.png)

## memlab6 

首先常规检查, 在cmdline中发现flag.rar, 

```
WinRAR.exe pid:   3716
Command line : "C:\Program Files\WinRAR\WinRAR.exe" "C:\Users\Jaffa\Desktop\pr0t3ct3d\flag.rar"
***********************************************************************
```

然后导出文件, 发现需要解压密码, 

在console中可以看到使用了env指令, 于是我们也尝试查看环境变量, 找到了winrar的密码, 

![image-20210807161331548](https://i.loli.net/2021/08/07/L7irJ91VMsvzNkF.png)

于是解压得到第二段flag:

![image-20210807161408948](https://i.loli.net/2021/08/07/d2uKQrsP84bS6OL.png)

然后题目提示使用浏览器聊天, 我们使用chromehistory可以获取到历史记录, 然后可以得到一个google文档, 

![image-20210807162159405](https://i.loli.net/2021/08/07/9q1nBGMX7cfv8Ug.png)

其中有个文件链接, 

![image-20210807162243626](https://i.loli.net/2021/08/07/EITVmgFp9aXSG21.png)

但是文件需要密码, 

然后我们通过其他线索,`screenshot`, 可以发现某个截图存在字符串`Mega Drive Key`, 然后直接用`strings Memlab6.raw | grep "Mega Drive Key"`, 找到了密码,  

![image-20210807154208306](https://i.loli.net/2021/08/07/ACt57YoLRQsux1F.png)

然后010中查看发现是IHDR错误, i改成I就可以了

![image-20210807154145623](https://i.loli.net/2021/08/07/FAGJPoCp9gXRSaf.png)

![image-20210807154247034](https://i.loli.net/2021/08/07/YMGqULkFo7g5hVN.png)

