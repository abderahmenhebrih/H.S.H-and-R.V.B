import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { getSupplierRequests, getConfig } from "@/services/supplier.service";
import type { SupplierRequest } from "@/types/supplier";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";
import { useLocalSearchParams } from "expo-router";

export default function SupplierRequestsScreen(){
  const { id } = useLocalSearchParams<{id?:string}>();
  const [requests, setRequests] = useState<SupplierRequest[]>([]);
  const [currency, setCurrency] = useState("DA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lang = getCurrentLanguage();
  const rtl = isRTL();

  const load = useCallback(async()=>{
    setError(null);
    try{
      const [rRes, cRes] = await Promise.all([getSupplierRequests(), getConfig().catch(()=>({currency:"DA"} as any))]);
      setRequests(rRes.requests);
      setCurrency(cRes.currency || "DA");
      if(id){
        const found = rRes.requests.find(x=> x.id===id);
        if(found) setTimeout(()=> showDetail(found, cRes.currency || "DA"), 300);
      }
    }catch(e:any){
      if(e?.code==="NETWORK_ERROR") setError("Connection problem. Pull to retry.");
      else setError(e?.message || "Failed to load requests");
    }finally{ setLoading(false); setRefreshing(false); }
  },[id]);

  useEffect(()=>{ load(); },[load]);
  const onRefresh = ()=>{ setRefreshing(true); load(); };

  const showDetail = (r:SupplierRequest, cur:string)=>{
    const statusLabel = r.status==="under_review" ? "Under Review" : r.status==="accepted" ? "Accepted" : "Rejected";
    const itemsStr = r.items ? r.items.map(i=> `${i.productId} q${i.quantity} ${i.weightKg}kg @${i.price} total ${i.total ?? formatCurrency((i.weightKg)*(i.price), cur)}`).join("\n") : "-";
    Alert.alert(`${r.type} • ${statusLabel}`, `Type: ${r.type}\nStatus: ${statusLabel}\nTotal: ${r.total!==null && r.total!==undefined ? formatCurrency(r.total, cur) : "-"}\nItems:\n${itemsStr}\nDescription: ${r.description||"-"}\nSubmitted: ${formatDateTime(r.submittedAt, lang)}\nReviewed: ${r.reviewedAt? formatDateTime(r.reviewedAt, lang):"-"}\nNotes: ${r.notes||"-"}\nID: ${r.id}`);
  };

  if(loading) return <Loading message="Loading requests..." />;
  if(error && requests.length===0) return <ErrorState title="Could not load requests" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={[styles.title, rtl && {textAlign:"right"}]}>Supplier Requests</Text>
        <Text style={[styles.subtitle, rtl && {textAlign:"right"}]}>Under Review → Accepted | Rejected. Tap for detail. Server total authoritative.</Text>
        {error ? <View style={{marginTop:8}}><ErrorState title="Connection problem" message={error} onRetry={load} /></View> : null}
        {requests.length===0 ? <View style={styles.card}><Empty title="No requests yet" message="New Supply and Discrepancy requests will appear here." /></View> : requests.map(r=>(
          <Pressable key={r.id} onPress={()=> showDetail(r, currency)} style={styles.card}>
            <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
              <Text style={styles.type}>{r.type}</Text>
              <View style={[styles.badge, r.status==="accepted"? styles.badgeAccepted : r.status==="rejected"? styles.badgeRejected : styles.badgeReview]}><Text style={styles.badgeText}>{r.status==="under_review" ? "Under Review" : r.status==="accepted" ? "Accepted" : "Rejected"}</Text></View>
            </View>
            {r.type==="new_supply" && r.items ? <Text style={styles.desc} numberOfLines={2}>{r.items.map(i=> `${i.productId} ${i.quantity}x ${i.weightKg}kg`).join(", ").slice(0,120)}</Text> : null}
            {r.total!==null && r.total!==undefined ? <Text style={styles.amount}>Total: {formatCurrency(r.total, currency)}</Text> : null}
            {r.description ? <Text style={styles.desc} numberOfLines={2}>{r.description}</Text> : null}
            <Text style={styles.date}>Submitted {formatDateTime(r.submittedAt, lang)}</Text>
            {r.reviewedAt ? <Text style={styles.date}>Reviewed {formatDateTime(r.reviewedAt, lang)}{r.notes? ` • ${r.notes}`:""}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content:{padding:16,paddingBottom:32},
  title:{fontSize:18,fontWeight:"800",color:"#0F172A"},
  subtitle:{marginTop:4,color:"#64748B",fontSize:12},
  card:{marginTop:12,backgroundColor:"#fff",borderRadius:12,padding:12,borderWidth:1,borderColor:"#E2E8F0"},
  type:{fontWeight:"700",color:"#0F172A",textTransform:"capitalize"},
  amount:{marginTop:4,color:"#0F766E",fontWeight:"600",fontSize:12},
  desc:{marginTop:4,color:"#475569",fontSize:12},
  date:{marginTop:4,color:"#94A3B8",fontSize:11},
  badge:{paddingHorizontal:8,paddingVertical:3,borderRadius:10},
  badgeReview:{backgroundColor:"#FEF3C7",borderWidth:1,borderColor:"#FDE68A"},
  badgeAccepted:{backgroundColor:"#DCFCE7",borderWidth:1,borderColor:"#86EFAC"},
  badgeRejected:{backgroundColor:"#FEE2E2",borderWidth:1,borderColor:"#FCA5A5"},
  badgeText:{fontSize:11,fontWeight:"700",color:"#334155"},
});
