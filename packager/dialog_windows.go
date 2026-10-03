//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// popupError 弹出系统错误消息框。
//
// 编译为 -H windowsgui 子系统后进程没有控制台，log 输出会丢失；
// 启动期致命错误必须用消息框提示，否则表现为"双击无反应"。
func popupError(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	messageBoxW := user32.NewProc("MessageBoxW")

	const (
		mbOK        = 0x00000000
		mbIconError = 0x00000010
	)

	title, err := syscall.UTF16PtrFromString("启动失败")
	if err != nil {
		return
	}
	text, err := syscall.UTF16PtrFromString(msg)
	if err != nil {
		return
	}

	messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(text)),
		uintptr(unsafe.Pointer(title)),
		uintptr(mbOK|mbIconError),
	)
}
