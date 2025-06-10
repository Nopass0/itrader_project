"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  RefreshCw, 
  Calendar, 
  ArrowDownUp, 
  Search, 
  Filter,
  Check,
  Clock,
  AlertCircle,
  ExternalLink,
  Info,
  X,
  DollarSign,
  MessageSquare
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatedText } from "@/components/ui/particles";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSocketApi } from "@/hooks/useSocketApi";
import { useToast } from "@/components/ui/use-toast";

// Helper to format relative time
const getRelativeTime = (timestamp: string | Date) => {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
};

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  let color = "";
  let text = "";
  let icon = null;
  
  const statusMap: Record<string, { color: string; text: string; icon: any }> = {
    pending: {
      color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
      text: "Pending",
      icon: <Clock size={14} className="mr-1" />
    },
    chat_started: {
      color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
      text: "Chat Started",
      icon: <MessageSquare size={14} className="mr-1" />
    },
    waiting_payment: {
      color: "text-orange-500 bg-orange-500/10 border-orange-500/20",
      text: "Waiting Payment",
      icon: <DollarSign size={14} className="mr-1" />
    },
    payment_received: {
      color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
      text: "Payment Received",
      icon: <Check size={14} className="mr-1" />
    },
    check_received: {
      color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
      text: "Check Received",
      icon: <Check size={14} className="mr-1" />
    },
    completed: {
      color: "text-green-500 bg-green-500/10 border-green-500/20",
      text: "Completed",
      icon: <Check size={14} className="mr-1" />
    },
    failed: {
      color: "text-red-500 bg-red-500/10 border-red-500/20",
      text: "Failed",
      icon: <X size={14} className="mr-1" />
    },
    cancelled: {
      color: "text-gray-500 bg-gray-500/10 border-gray-500/20",
      text: "Cancelled",
      icon: <X size={14} className="mr-1" />
    }
  };

  const statusInfo = statusMap[status] || {
    color: "text-muted-foreground bg-muted/50",
    text: status,
    icon: null
  };
  
  return (
    <Badge variant="outline" className={`${statusInfo.color} flex items-center`}>
      {statusInfo.icon}
      {statusInfo.text}
    </Badge>
  );
};

// Transaction card component
const TransactionCard = ({ transaction }: { transaction: any }) => {
  const { toast } = useToast();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      layout
    >
      <Card glass hover className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">
                  Order #{transaction.orderId || 'N/A'}
                </CardTitle>
                {transaction.advertisement?.type && (
                  <Badge variant="outline" className={
                    transaction.advertisement.type === 'sell' 
                      ? "text-red-500 bg-red-500/10 border-red-500/20"
                      : "text-green-500 bg-green-500/10 border-green-500/20"
                  }>
                    {transaction.advertisement.type.toUpperCase()}
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                {transaction.counterpartyName || 'Unknown Counterparty'}
              </CardDescription>
            </div>
            <StatusBadge status={transaction.status} />
          </div>
        </CardHeader>
        
        <CardContent className="pb-2">
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-medium">
                {transaction.amount || 0} {transaction.advertisement?.currency || 'USDT'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fiat:</span>
              <span className="font-medium">
                {transaction.advertisement?.fiat || 'RUB'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-medium">
                {transaction.advertisement?.price || 'N/A'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Messages:</span>
              <span className="font-medium">
                {transaction._count?.chatMessages || 0}
              </span>
            </div>
            
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Created:</span>
              <span className="font-medium">{getRelativeTime(transaction.createdAt)}</span>
            </div>
            
            {transaction.completedAt && (
              <div className="flex justify-between col-span-2">
                <span className="text-muted-foreground">Completed:</span>
                <span className="font-medium">{getRelativeTime(transaction.completedAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
        
        <CardFooter className="pt-2 flex gap-2 justify-between">
          <div className="text-xs text-muted-foreground overflow-hidden">
            ID: <span className="font-mono truncate">{transaction.id}</span>
          </div>
          
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
              toast({
                title: "Transaction Details",
                description: `View details for transaction ${transaction.id}`,
              });
            }}>
              <Info size={14} />
            </Button>
            
            {transaction.orderId && (
              <Button size="sm" variant="ghost" onClick={() => {
                toast({
                  title: "View Chat",
                  description: `Open chat for order ${transaction.orderId}`,
                });
              }}>
                <MessageSquare size={14} />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
};

// Main transactions page component
export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { isConnected, isLoading, error, transactions: transactionsApi, subscribe } = useSocketApi();
  const { toast } = useToast();

  // Load transactions
  const loadTransactions = async () => {
    setIsRefreshing(true);
    try {
      const response = await transactionsApi.list({
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: sortOrder as 'asc' | 'desc'
      });
      
      if (response.success && response.data) {
        setTransactions(response.data.data || []);
      } else {
        toast({
          title: "Error",
          description: response.error?.message || "Failed to load transactions",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Load transactions on mount and when sort order changes
  useEffect(() => {
    if (isConnected) {
      loadTransactions();
    }
  }, [isConnected, sortOrder]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribeCreated = subscribe('transaction:created', (data: any) => {
      setTransactions(prev => [data, ...prev]);
      toast({
        title: "New Transaction",
        description: `New transaction created: ${data.id}`,
      });
    });

    const unsubscribeUpdated = subscribe('transaction:updated', (data: any) => {
      setTransactions(prev => 
        prev.map(t => t.id === data.id ? { ...t, ...data.transaction } : t)
      );
    });

    return () => {
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, [subscribe, toast]);

  // Filter transactions
  const filteredTransactions = transactions.filter(transaction => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        transaction.id.toLowerCase().includes(query) ||
        transaction.orderId?.toLowerCase().includes(query) ||
        transaction.counterpartyName?.toLowerCase().includes(query) ||
        transaction.status.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Toggle sort order
  const toggleSortOrder = () => {
    setSortOrder(sortOrder === "desc" ? "asc" : "desc");
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1 className="text-3xl font-semibold mb-2 flex items-center gap-2">
          <span className="text-2xl">💳</span>
          <AnimatedText>Transactions</AnimatedText>
        </h1>
        <p className="text-muted-foreground">
          P2P trading transactions and order history
        </p>
      </motion.div>
      
      {/* Connection status */}
      {!isConnected && (
        <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertCircle size={18} />
              <span>Connecting to server...</span>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Search transactions..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Button variant="outline" className="gap-1.5" onClick={toggleSortOrder}>
          <ArrowDownUp size={16} />
          {sortOrder === "desc" ? "Newest First" : "Oldest First"}
        </Button>
        
        <Button variant="outline" className="gap-1.5">
          <Calendar size={16} />
          Date Range
        </Button>
        
        <Button variant="outline" className="gap-1.5">
          <Filter size={16} />
          Filters
        </Button>
        
        <Button 
          variant="ghost" 
          className="gap-1.5" 
          onClick={loadTransactions}
          disabled={isRefreshing}
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="mb-6">
          <TabsTrigger value="all" className="flex items-center gap-1.5">
            <span>All</span>
            <Badge className="ml-1" variant="outline">{filteredTransactions.length}</Badge>
          </TabsTrigger>
          
          <TabsTrigger value="active" className="flex items-center gap-1.5">
            <span>Active</span>
            <Badge className="ml-1" variant="outline">
              {filteredTransactions.filter(t => 
                !['completed', 'failed', 'cancelled'].includes(t.status)
              ).length}
            </Badge>
          </TabsTrigger>
          
          <TabsTrigger value="completed" className="flex items-center gap-1.5">
            <span>Completed</span>
            <Badge className="ml-1" variant="outline">
              {filteredTransactions.filter(t => t.status === 'completed').length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="space-y-4 mt-2">
          <AnimatePresence>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading transactions...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <Card className="text-center py-8">
                <CardContent>
                  <p className="text-muted-foreground">No transactions found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTransactions.map(transaction => (
                  <TransactionCard key={transaction.id} transaction={transaction} />
                ))}
              </div>
            )}
          </AnimatePresence>
        </TabsContent>
        
        <TabsContent value="active" className="space-y-4 mt-2">
          <AnimatePresence>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTransactions
                .filter(t => !['completed', 'failed', 'cancelled'].includes(t.status))
                .map(transaction => (
                  <TransactionCard key={transaction.id} transaction={transaction} />
                ))}
            </div>
          </AnimatePresence>
        </TabsContent>
        
        <TabsContent value="completed" className="space-y-4 mt-2">
          <AnimatePresence>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTransactions
                .filter(t => t.status === 'completed')
                .map(transaction => (
                  <TransactionCard key={transaction.id} transaction={transaction} />
                ))}
            </div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
}