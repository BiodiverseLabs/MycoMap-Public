import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Menu, 
  Plus, 
  Edit, 
  Trash2, 
  ChevronUp, 
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical
} from "lucide-react";

interface MenuItem {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
  isVisible: boolean;
  requiresAuth: boolean;
  requiresSubscription: boolean;
  children?: MenuItem[];
}

export default function AdminMenuManager() {
  const { toast } = useToast();
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [addingParentId, setAddingParentId] = useState<number | null>(null);

  const { data: menuItems = [], isLoading, refetch } = useQuery<MenuItem[]>({
    queryKey: ["/api/cms/admin/navigation"],
  });

  const buildTree = (items: MenuItem[]): MenuItem[] => {
    const map = new Map<number, MenuItem>();
    const roots: MenuItem[] = [];

    items.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    items.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parentId === null) {
        roots.push(node);
      } else {
        const parent = map.get(item.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    const sortItems = (items: MenuItem[]) => {
      items.sort((a, b) => a.sortOrder - b.sortOrder);
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          sortItems(item.children);
        }
      });
    };

    sortItems(roots);
    return roots;
  };

  const menuTree = buildTree(menuItems);

  const updateItemMutation = useMutation({
    mutationFn: async (item: Partial<MenuItem> & { id: number }) => {
      return apiRequest("PATCH", `/api/cms/admin/navigation/${item.id}`, item);
    },
    onSuccess: () => {
      toast({ title: "Menu item updated" });
      refetch();
      setEditingItem(null);
    },
    onError: () => {
      toast({ title: "Failed to update menu item", variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: Partial<MenuItem>) => {
      return apiRequest("POST", "/api/cms/admin/navigation", item);
    },
    onSuccess: () => {
      toast({ title: "Menu item added" });
      refetch();
      setIsAddingItem(false);
      setAddingParentId(null);
    },
    onError: () => {
      toast({ title: "Failed to add menu item", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/cms/admin/navigation/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Menu item deleted" });
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to delete menu item", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: number; direction: 'up' | 'down' }) => {
      return apiRequest("POST", `/api/cms/admin/navigation/${id}/reorder`, { direction });
    },
    onSuccess: () => {
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to reorder item", variant: "destructive" });
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, isVisible }: { id: number; isVisible: boolean }) => {
      return apiRequest("PATCH", `/api/cms/admin/navigation/${id}`, { isVisible });
    },
    onSuccess: () => {
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to toggle visibility", variant: "destructive" });
    },
  });

  const renderMenuItem = (item: MenuItem, siblings: MenuItem[], idx: number, level: number = 0) => {
    const isFirst = idx === 0;
    const isLast = idx === siblings.length - 1;

    return (
      <div key={item.id} className="border-b last:border-b-0">
        <div 
          className={`flex items-center justify-between p-3 hover:bg-gray-50 ${!item.isVisible ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${1 + level * 1.5}rem` }}
          data-testid={`menu-item-${item.id}`}
        >
          <div className="flex items-center gap-3">
            <GripVertical className="h-4 w-4 text-gray-400" />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{item.label}</span>
                {!item.isVisible && (
                  <span className="text-xs text-gray-400">(hidden)</span>
                )}
              </div>
              <span className="text-xs text-gray-500">{item.href}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isFirst}
              onClick={() => reorderMutation.mutate({ id: item.id, direction: 'up' })}
              data-testid={`button-reorder-up-${item.id}`}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isLast}
              onClick={() => reorderMutation.mutate({ id: item.id, direction: 'down' })}
              data-testid={`button-reorder-down-${item.id}`}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => toggleVisibilityMutation.mutate({ id: item.id, isVisible: !item.isVisible })}
              data-testid={`button-toggle-visibility-${item.id}`}
            >
              {item.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setAddingParentId(item.id);
                setIsAddingItem(true);
              }}
              data-testid={`button-add-child-${item.id}`}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditingItem(item)}
              data-testid={`button-edit-${item.id}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (confirm(`Delete "${item.label}"? ${item.children?.length ? 'Child items will become top-level items.' : ''}`)) {
                  deleteItemMutation.mutate(item.id);
                }
              }}
              data-testid={`button-delete-${item.id}`}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
        {item.children && item.children.length > 0 && (
          <div className="bg-gray-50/50">
            {item.children.map((child, childIdx) => 
              renderMenuItem(child, item.children!, childIdx, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-myco-brown" data-testid="text-menu-manager-title">Menu Manager</h1>
        <p className="text-gray-600">Manage website navigation menu structure</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Menu className="h-5 w-5" />
              Navigation Menu
            </CardTitle>
            <CardDescription>Drag items to reorder, click to edit</CardDescription>
          </div>
          <Button 
            onClick={() => {
              setAddingParentId(null);
              setIsAddingItem(true);
            }}
            className="bg-myco-green hover:bg-myco-green/90"
            data-testid="button-add-menu-item"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Menu Item
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin h-8 w-8 border-2 border-myco-green border-t-transparent rounded-full mx-auto mb-3" />
              <p>Loading menu items...</p>
            </div>
          ) : menuTree.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Menu className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No menu items yet. Add an item to get started.</p>
            </div>
          ) : (
            <div className="divide-y">
              {menuTree.map((item, idx) => renderMenuItem(item, menuTree, idx))}
            </div>
          )}
        </CardContent>
      </Card>

      <MenuItemDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={(updates) => {
          if (editingItem) {
            updateItemMutation.mutate({ id: editingItem.id, ...updates });
          }
        }}
        isPending={updateItemMutation.isPending}
        menuItems={menuItems}
      />

      <AddMenuItemDialog
        isOpen={isAddingItem}
        parentId={addingParentId}
        onClose={() => {
          setIsAddingItem(false);
          setAddingParentId(null);
        }}
        onAdd={(item) => addItemMutation.mutate(item)}
        isPending={addItemMutation.isPending}
        menuItems={menuItems}
        nextSortOrder={
          addingParentId === null 
            ? menuTree.length 
            : (menuTree.find(m => m.id === addingParentId)?.children?.length || 0)
        }
      />
    </div>
  );
}

function MenuItemDialog({ 
  item, 
  onClose, 
  onSave, 
  isPending,
  menuItems
}: { 
  item: MenuItem | null; 
  onClose: () => void;
  onSave: (updates: Partial<MenuItem>) => void;
  isPending: boolean;
  menuItems: MenuItem[];
}) {
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [isVisible, setIsVisible] = useState(true);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [requiresSubscription, setRequiresSubscription] = useState(false);

  useState(() => {
    if (item) {
      setLabel(item.label);
      setHref(item.href);
      setParentId(item.parentId?.toString() || "none");
      setIsVisible(item.isVisible);
      setRequiresAuth(item.requiresAuth);
      setRequiresSubscription(item.requiresSubscription);
    }
  });

  if (!item) return null;

  const topLevelItems = menuItems.filter(m => m.parentId === null && m.id !== item.id);

  return (
    <Dialog open={!!item} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Menu Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Label</Label>
            <Input 
              value={label} 
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Menu label"
              data-testid="input-edit-label"
            />
          </div>
          <div>
            <Label>Link (href)</Label>
            <Input 
              value={href} 
              onChange={(e) => setHref(e.target.value)}
              placeholder="/page-slug or https://..."
              data-testid="input-edit-href"
            />
          </div>
          <div>
            <Label>Parent Item</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger data-testid="select-edit-parent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Top Level)</SelectItem>
                {topLevelItems.map(m => (
                  <SelectItem key={m.id} value={m.id.toString()}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Visible</Label>
            <Switch 
              checked={isVisible} 
              onCheckedChange={setIsVisible}
              data-testid="switch-edit-visible"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Requires Login</Label>
            <Switch 
              checked={requiresAuth} 
              onCheckedChange={setRequiresAuth}
              data-testid="switch-edit-requires-auth"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Requires Subscription</Label>
            <Switch 
              checked={requiresSubscription} 
              onCheckedChange={setRequiresSubscription}
              data-testid="switch-edit-requires-subscription"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={() => onSave({ 
              label,
              href,
              parentId: parentId === "none" ? null : parseInt(parentId),
              isVisible,
              requiresAuth,
              requiresSubscription
            })}
            disabled={isPending || !label || !href}
            className="bg-myco-green hover:bg-myco-green/90"
            data-testid="button-save-edit"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMenuItemDialog({
  isOpen,
  parentId,
  onClose,
  onAdd,
  isPending,
  menuItems,
  nextSortOrder
}: {
  isOpen: boolean;
  parentId: number | null;
  onClose: () => void;
  onAdd: (item: Partial<MenuItem>) => void;
  isPending: boolean;
  menuItems: MenuItem[];
  nextSortOrder: number;
}) {
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string>("none");

  useState(() => {
    setSelectedParentId(parentId?.toString() || "none");
  });

  const topLevelItems = menuItems.filter(m => m.parentId === null);

  const handleAdd = () => {
    onAdd({
      label,
      href,
      parentId: selectedParentId === "none" ? null : parseInt(selectedParentId),
      sortOrder: nextSortOrder,
      isVisible: true,
      requiresAuth: false,
      requiresSubscription: false
    });
    setLabel("");
    setHref("");
    setSelectedParentId("none");
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Menu Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Label</Label>
            <Input 
              value={label} 
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Menu label"
              data-testid="input-add-label"
            />
          </div>
          <div>
            <Label>Link (href)</Label>
            <Input 
              value={href} 
              onChange={(e) => setHref(e.target.value)}
              placeholder="/page-slug or https://..."
              data-testid="input-add-href"
            />
          </div>
          <div>
            <Label>Parent Item</Label>
            <Select value={selectedParentId} onValueChange={setSelectedParentId}>
              <SelectTrigger data-testid="select-add-parent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Top Level)</SelectItem>
                {topLevelItems.map(m => (
                  <SelectItem key={m.id} value={m.id.toString()}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdd}
            disabled={isPending || !label || !href}
            className="bg-myco-green hover:bg-myco-green/90"
            data-testid="button-add-submit"
          >
            {isPending ? "Adding..." : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
