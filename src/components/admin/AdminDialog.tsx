"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog@1.1.6";
import { XIcon } from "lucide-react@0.487.0";
import { cn } from "../ui/utils";

const AdminDialog = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>
>(({ ...props }, ref) => {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
});
AdminDialog.displayName = DialogPrimitive.Root.displayName;

const AdminDialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>(({ ...props }, ref) => {
  return <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />;
});
AdminDialogTrigger.displayName = DialogPrimitive.Trigger.displayName;

const AdminDialogPortal = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Portal>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>
>(({ ...props }, ref) => {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
});
AdminDialogPortal.displayName = DialogPrimitive.Portal.displayName;

const AdminDialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ ...props }, ref) => {
  return <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />;
});
AdminDialogClose.displayName = DialogPrimitive.Close.displayName;

const AdminDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-transparent pointer-events-none",
        className,
      )}
      {...props}
    />
  );
});
AdminDialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const AdminDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    'data-transparent'?: string;
  }
>(({ className, children, ...props }, ref) => {
  const contentId = React.useId();
  const defaultDescriptionId = `dialog-description-${contentId}`;
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  React.useImperativeHandle(ref, () => contentRef.current as HTMLDivElement);

  const handleMouseDown = (e: React.MouseEvent) => {
    // 헤더 영역에서만 드래그 가능
    const target = e.target as HTMLElement;
    const header = contentRef.current?.querySelector('[data-slot="dialog-header"]');
    if (header && (header.contains(target) || header === target)) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // data-transparent를 props에서 추출
  const isTransparent = props['data-transparent'];

  return (
    <AdminDialogPortal data-slot="dialog-portal">
      <AdminDialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        data-transparent={isTransparent}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full gap-4 rounded-lg border p-6 shadow-lg duration-200",
          className,
        )}
        aria-describedby={props['aria-describedby'] || defaultDescriptionId}
        {...props}
      >
        {children}
        {!props['aria-describedby'] && (
          <div id={defaultDescriptionId} className="sr-only">
            Dialog
          </div>
        )}
      </DialogPrimitive.Content>
    </AdminDialogPortal>
  );
});
AdminDialogContent.displayName = DialogPrimitive.Content.displayName;

const AdminDialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left cursor-grab active:cursor-grabbing", className)}
      {...props}
    />
  );
});
AdminDialogHeader.displayName = "AdminDialogHeader";

const AdminDialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
});
AdminDialogFooter.displayName = "AdminDialogFooter";

const AdminDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
});
AdminDialogTitle.displayName = DialogPrimitive.Title.displayName;

const AdminDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
});
AdminDialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  AdminDialog,
  AdminDialogClose,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogFooter,
  AdminDialogHeader,
  AdminDialogOverlay,
  AdminDialogPortal,
  AdminDialogTitle,
  AdminDialogTrigger,
};