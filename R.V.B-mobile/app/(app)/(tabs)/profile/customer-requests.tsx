import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Loading } from "@/components/common/Loading";
import { ErrorState } from "@/components/common/ErrorState";
import { Empty } from "@/components/common/Empty";
import { getCustomerRequests, getConfig } from "@/services/customer.service";
import type { CustomerRequest } from "@/types/customer";
import { formatCurrency } from "@/utils/currency";
import { formatDateTime, getCurrentLanguage } from "@/utils/date";
import { isRTL } from "@/i18n";

export default function CustomerRequestsScreen(){
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [currency, setCurrency] = useState("DA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const lang = getCurrentLanguage();
  const rtl = isRTL();

  const load = useCallback(async()=>{
    setError(null);
    try{
      const [rRes, cRes] = await Promise.all([getCustomerRequests(), getConfig().catch(()=>({currency:"DA"} as any))]);
      setRequests(rRes.requests);
      setCurrency(cRes.currency || "DA");
    }catch(e:any){
      if(e?.code==="NETWORK_ERROR") setError("Connection problem. Pull to retry.");
      else setError(e?.message || "Failed to load requests");
    }finally{ setLoading(false); setRefreshing(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);
  const onRefresh = ()=>{ setRefreshing(true); load(); };

  if(loading) return <Loading message="Loading requests..." />;
  if(error && requests.length===0) return <ErrorState title="Could not load requests" message={error} onRetry={load} />;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={[styles.title, rtl && {textAlign:"right"}]}>Shipment Requests</Text>
        <Text style={[styles.subtitle, rtl && {textAlign:"right"}]}>Insert Shipment and Discrepancy requests. Under Review → Accepted | Rejected.</Text>
        {error ? <View style={{marginTop:8}}><ErrorState title="Connection problem" message={error} onRetry={load} /></View> : null}
        {requests.length===0 ? <View style={styles.card}><Empty title="No requests yet" message="Your Insert Shipment and Discrepancy requests will appear here." /></View> : requests.map(r=>(
          <View key={r.id} style={styles.card}>
            <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
              <Text style={styles.type}>{r.type}</Text>
              <View style={[styles.badge, r.status==="accepted"? styles.badgeAccepted : r.status==="rejected"? styles.badgeRejected : styles.badgeReview]}><Text style={styles.badgeText}>{r.status==="under_review" ? "Under Review" : r.status.charAt(0).toUpperCase()+r.status.slice(1)}</Text></View>
            </View>
            {r.type==="insert_shipment" && r.items ? <Text style={styles.desc} numberOfLines={2}>{r.items.map(i=> `${i.productId.slice(0,8)} x${i.quantity} ${i.weightKg}kg @${formatCurrency(i.price,currency)}`).join(", ").slice(0,120)}</Text> : null}
            {r.total!==null && r.total!==undefined ? <Text style={styles.amount}>Total {formatCurrency(r.total,currency)} (server)</Text> : null}
            {r.description ? <Text style={styles.desc} numberOfLines={2}>{r.description}</Text> : null}
            <Text style={styles.date}>Submitted {formatDateTime(r.submittedAt, lang)}{r.reviewedAt ? ` • Reviewed ${formatDateTime(r.reviewedAt, lang)}` : ""}</Text>
            {r.notes ? <Text style={styles.desc}>Notes: {r.notes}</Text> : null}
            {r.saleId ? <Text style={styles.desc}>Sale {r.saleId.slice(0,8)}</Text> : null}
          </View>
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
