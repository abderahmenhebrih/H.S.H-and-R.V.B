import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Alert } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Button } from "@/components/common/Button";
import { createDiscrepancy } from "@/services/supplier.service";
import { useRouter } from "expo-router";
import { isRTL } from "@/i18n";

export default function SupplierDiscrepancyScreen(){
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const rtl = isRTL();
  const trimmed = description.trim();
  const count = description.length;

  const validate = ():string|null=>{
    if(!trimmed) return "Description is required";
    if(count>2000) return "Description must be ≤2000 characters";
    return null;
  };
  const handleSubmit = async()=>{
    const v=validate();
    if(v){ setError(v); return; }
    if(submitting) return;
    setError(null);
    setSubmitting(true);
    try{
      await createDiscrepancy(trimmed);
      Alert.alert("Success","Discrepancy report submitted for review.",[{text:"OK",onPress:()=> router.back()}]);
      setDescription("");
    }catch(e:any){
      const code=e?.code;
      if(code==="RVB_DESCRIPTION_REQUIRED") setError("Description is required");
      else if(code==="RVB_DESCRIPTION_TOO_LONG") setError("Description must be ≤2000 characters");
      else setError(e?.message || "Failed to submit");
    }finally{ setSubmitting(false); }
  };
  return (
    <Screen padded scroll>
      <Text style={[styles.title, rtl && {textAlign:"right"}]}>Discrepancy Report</Text>
      <Text style={[styles.subtitle, rtl && {textAlign:"right"}]}>Report a discrepancy. Controlled review only, no direct balance or inventory mutation.</Text>
      <View style={styles.form}>
        <Text style={[styles.label, rtl && {textAlign:"right"}]}>Description *</Text>
        <TextInput style={[styles.textArea, rtl && {textAlign:"right"}]} value={description} onChangeText={setDescription} placeholder="Describe..." multiline numberOfLines={6} maxLength={2001} textAlignVertical="top" placeholderTextColor="#94A3B8" />
        <View style={styles.counterRow}>
          <Text style={[styles.counter, count>2000 && styles.counterError]}>{count} / 2000</Text>
          <Text style={styles.counterHint}>{2000-count >=0 ? `${2000-count} remaining` : `${count-2000} over`}</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Submit Discrepancy" onPress={handleSubmit} loading={submitting} disabled={submitting} />
        <Text style={styles.hint}>No business data altered until reviewed.</Text>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  title:{fontSize:20,fontWeight:"800",color:"#0F172A"},
  subtitle:{marginTop:6,color:"#64748B",fontSize:13},
  form:{marginTop:16,backgroundColor:"#fff",borderRadius:12,padding:16,borderWidth:1,borderColor:"#E2E8F0"},
  label:{fontSize:11,color:"#64748B",fontWeight:"600",textTransform:"uppercase",marginBottom:6},
  textArea:{borderWidth:1,borderColor:"#CBD5E1",borderRadius:10,padding:12,fontSize:14,color:"#0F172A",minHeight:120,backgroundColor:"#fff"},
  counterRow:{flexDirection:"row",justifyContent:"space-between",marginTop:6},
  counter:{fontSize:12,color:"#64748B",fontWeight:"600"},
  counterError:{color:"#DC2626"},
  counterHint:{fontSize:12,color:"#94A3B8"},
  error:{color:"#DC2626",textAlign:"center",marginTop:8,marginBottom:8,fontSize:13},
  hint:{marginTop:8,color:"#94A3B8",fontSize:11,textAlign:"center"},
});
