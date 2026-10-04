import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, TextInput, ScrollView } from "react-native";
import { Screen } from "@/components/common/Screen";
import { Button } from "@/components/common/Button";
import { Loading } from "@/components/common/Loading";
import { getCatalogForCustomer, createOrder, getConfig, newIdempotencyKey } from "@/services/customer.service";
import type { CatalogProduct } from "@/types/customer";
import { formatCurrency } from "@/utils/currency";
import { useRouter } from "expo-router";
import { isRTL } from "@/i18n";

type Item = { productId: string; quantity: string; weightKg: string; price: string };
function roundMoney(v:number){ return Math.round(v*100)/100; }

export default function PlaceOrderScreen(){
  const router = useRouter();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [items, setItems] = useState<Item[]>([{ productId:"", quantity:"1", weightKg:"0", price:"0"}]);
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("DA");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [showPickerFor, setShowPickerFor] = useState<number|null>(null);
  const rtl = isRTL();
  // Idempotency identity for THIS submission attempt: created once, reused
  // across retries/re-taps after ambiguous failure, cleared on success so
  // the next intentional order gets a new key. Server returns the same order
  // for replays instead of inserting duplicates.
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(()=>{
    (async()=>{
      try{
        const [cat, cfg] = await Promise.all([getCatalogForCustomer(), getConfig().catch(()=>({currency:"DA"} as any))]);
        setProducts(cat.products);
        setCurrency(cfg.currency || "DA");
      }catch(e:any){ setError(e?.message || "Failed to load catalog"); }finally{ setLoading(false); }
    })();
  },[]);

  const updateItem = (idx:number, field:keyof Item, value:string)=> setItems(prev=> prev.map((it,i)=> i===idx ? {...it, [field]:value} : it));
  const addItem = ()=>{
    if(items.length>=50){ Alert.alert("Limit","Max 50 items"); return; }
    setItems(prev=> [...prev, { productId:"", quantity:"1", weightKg:"0", price:"0"}]);
  };
  const removeItem = (idx:number)=>{
    if(items.length===1){ Alert.alert("Required","At least one item required"); return; }
    setItems(prev=> prev.filter((_,i)=> i!==idx));
  };

  const validate = ():string|null=>{
    if(items.length===0) return "At least one item required";
    if(items.length>50) return "Too many items (max 50)";
    for(let i=0;i<items.length;i++){
      const it=items[i];
      if(!it.productId) return `Item ${i+1}: product required`;
      const q=Number(it.quantity);
      if(!Number.isFinite(q) || q<=0) return `Item ${i+1}: quantity must be >0`;
      const w=Number(it.weightKg);
      if(!Number.isFinite(w) || w<0) return `Item ${i+1}: weight must be >=0`;
      if(!products.find(p=> p.id===it.productId)) return `Item ${i+1}: product not found`;
    }
    if(notes.length>2000) return "Notes must be ≤2000 characters";
    return null;
  };

  const handleSubmit = async()=>{
    const v = validate();
    if(v){ setError(v); return; }
    if(submitting) return;
    setError(null);
    setSubmitting(true);
    try{
      const payloadItems = items.map(it=>{
        const prod = products.find(p=> p.id===it.productId);
        // Production uses actual catalog price; backend is authoritative and will recompute anyway
        return {
          productId: it.productId,
          quantity: Number(it.quantity),
          weightKg: Number(it.weightKg),
          price: prod ? prod.price : Number(it.price) || 0,
        };
      });
      await createOrder(
        { items: payloadItems, notes: notes.trim() || undefined },
        { idempotencyKey: idempotencyKeyRef.current ?? (idempotencyKeyRef.current = newIdempotencyKey()) },
      );
      Alert.alert("Success","Order placed. Status Under Review.",[{text:"OK",onPress:()=> router.back()}]);
      idempotencyKeyRef.current = null;
      setItems([{ productId:"", quantity:"1", weightKg:"0", price:"0"}]);
      setNotes("");
    }catch(e:any){
      const code=e?.code;
      if(code==="RVB_PRODUCT_NOT_FOUND") setError("Product not found");
      else if(code==="RVB_ITEMS_REQUIRED") setError("Items required");
      else if(code==="RVB_QUANTITY_INVALID") setError("Quantity must be >0");
      else if(code==="RVB_WEIGHT_INVALID") setError("Weight must be >=0");
      else if(code==="RVB_INSUFFICIENT_STOCK") setError("Insufficient stock for product");
      else setError(e?.message || "Failed to place order");
    }finally{ setSubmitting(false); }
  };

  if(loading) return <Loading message="Loading catalog..." />;
  return (
    <Screen padded scroll>
      <Text style={[styles.title, rtl && {textAlign:"right"}]}>Place Order</Text>
      <Text style={[styles.subtitle, rtl && {textAlign:"right"}]}>Price is server-authoritative. Submitted price/total will be ignored and recomputed.</Text>

      {items.map((it, idx)=>{
        const prod = products.find(p=> p.id===it.productId);
        const serverPrice = prod ? prod.price : Number(it.price) || 0;
        const w = Number(it.weightKg) || 0;
        const est = roundMoney(w * serverPrice);
        const prodName = prod?.name || "Select product";
        return (
          <View key={idx} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>Item {idx+1}</Text>
              {items.length>1 ? <Pressable onPress={()=> removeItem(idx)}><Text style={styles.remove}>Remove</Text></Pressable> : null}
            </View>
            <Pressable testID={`product-selector-${idx}`} accessibilityRole="button" style={styles.picker} onPress={()=> setShowPickerFor(showPickerFor===idx? null : idx)}>
              <Text style={styles.pickerText}>{prodName}</Text>
              <Text style={styles.pickerHint}>{prod ? `${formatCurrency(prod.price,currency)} ${prod.available? "• available":""}` : "Tap to choose"}</Text>
            </Pressable>
            {showPickerFor===idx ? (
              <View style={styles.pickerList}>
                <ScrollView style={{maxHeight:150}}>
                  {products.map(pr=>(
                    <Pressable key={pr.id} testID={`product-option-${pr.id}`} accessibilityRole="button" style={styles.productRow} onPress={()=> { updateItem(idx,"productId",pr.id); setShowPickerFor(null); }}>
                      <Text style={styles.productName}>{pr.name}</Text>
                      <Text style={styles.productPrice}>{formatCurrency(pr.price,currency)} {pr.available? "• available":""}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Quantity *</Text>
                <TextInput testID={`customer-order-quantity-${idx}`} accessibilityLabel="quantity" style={styles.input} value={it.quantity} onChangeText={v=> updateItem(idx,"quantity",v)} keyboardType="numeric" placeholder="1" />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>WeightKg</Text>
                <TextInput testID={`customer-order-weight-${idx}`} accessibilityLabel="weight" style={styles.input} value={it.weightKg} onChangeText={v=> updateItem(idx,"weightKg",v)} keyboardType="numeric" placeholder="0" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.field}>
                <Text style={styles.label}>Server Price</Text>
                <View style={styles.totalBox}><Text style={styles.totalText}>{formatCurrency(serverPrice,currency)}</Text></View>
                <Text style={styles.calcHint}>authoritative</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Est. Total</Text>
                <View style={styles.totalBox}><Text style={styles.totalText}>{formatCurrency(est,currency)}</Text></View>
                <Text style={styles.calcHint}>weight × price</Text>
              </View>
            </View>
          </View>
        );
      })}

      <Pressable testID="customer-order-add-item" accessibilityRole="button" onPress={addItem} style={styles.addBtn}><Text style={styles.addText}>+ Add Product</Text></Pressable>
      <View style={styles.notesWrap}>
        <Text style={styles.label}>Notes (optional, ≤2000)</Text>
        <TextInput testID="customer-order-notes" accessibilityLabel="notes" style={[styles.input, {minHeight:60}]} value={notes} onChangeText={setNotes} placeholder="Order notes" multiline textAlignVertical="top" maxLength={2001} />
        <Text style={styles.hint}>{notes.length} / 2000</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button testID="customer-place-order-submit" accessibilityRole="button" title="Place Order" onPress={handleSubmit} loading={submitting} disabled={submitting} />
      <Text style={styles.hint}>Order will be Under Review. No inventory or balance change until review.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title:{fontSize:20,fontWeight:"800",color:"#0F172A"},
  subtitle:{marginTop:6,color:"#64748B",fontSize:13},
  hint:{marginTop:6,color:"#94A3B8",fontSize:11,textAlign:"center"},
  error:{color:"#DC2626",textAlign:"center",marginVertical:8,fontSize:13},
  itemCard:{marginTop:12,backgroundColor:"#fff",borderRadius:12,padding:12,borderWidth:1,borderColor:"#E2E8F0"},
  itemHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  itemTitle:{fontWeight:"700",color:"#0F172A"},
  remove:{color:"#DC2626",fontWeight:"600",fontSize:12},
  picker:{borderWidth:1,borderColor:"#CBD5E1",borderRadius:8,padding:10,backgroundColor:"#F8FAFC"},
  pickerText:{fontWeight:"600",color:"#0F172A"},
  pickerHint:{color:"#94A3B8",fontSize:11,marginTop:2},
  pickerList:{marginTop:8,borderWidth:1,borderColor:"#E2E8F0",borderRadius:8,backgroundColor:"#fff",maxHeight:150},
  productRow:{padding:10,borderBottomWidth:1,borderBottomColor:"#F1F5F9"},
  productName:{fontWeight:"600",color:"#0F172A"},
  productPrice:{color:"#64748B",fontSize:11,marginTop:2},
  row:{flexDirection:"row",gap:10,marginTop:10},
  field:{flex:1},
  label:{fontSize:11,color:"#64748B",fontWeight:"600",textTransform:"uppercase",marginBottom:4},
  input:{borderWidth:1,borderColor:"#CBD5E1",borderRadius:8,padding:10,fontSize:14,color:"#0F172A",backgroundColor:"#fff"},
  totalBox:{borderWidth:1,borderColor:"#E2E8F0",borderRadius:8,padding:10,backgroundColor:"#F1F5F9",alignItems:"center"},
  totalText:{fontWeight:"800",color:"#0F766E"},
  calcHint:{color:"#94A3B8",fontSize:10,marginTop:2,textAlign:"center"},
  addBtn:{marginTop:12,alignItems:"center",padding:10,borderWidth:1,borderColor:"#0F766E",borderRadius:8,backgroundColor:"#fff"},
  addText:{color:"#0F766E",fontWeight:"600"},
  notesWrap:{marginTop:12,backgroundColor:"#fff",borderRadius:12,padding:12,borderWidth:1,borderColor:"#E2E8F0"},
});
