package com.rideeasy.passenger;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "UpiPayment")
public class UpiPaymentPlugin extends Plugin {

    @PluginMethod
    public void pay(PluginCall call) {
        String upiId = call.getString("upiId");
        String name = call.getString("name", "RideEasy");
        String amount = call.getString("amount");
        String transactionRef = call.getString("transactionRef", "RIDE_" + System.currentTimeMillis());
        String note = call.getString("note", "RideEasy Wallet Recharge");

        if (upiId == null || upiId.trim().isEmpty()) {
            call.reject("UPI ID is required");
            return;
        }

        if (amount == null || amount.trim().isEmpty()) {
            call.reject("Amount is required");
            return;
        }

        String uri =
                "upi://pay" +
                "?pa=" + Uri.encode(upiId) +
                "&pn=" + Uri.encode(name) +
                "&am=" + Uri.encode(amount) +
                "&cu=INR" +
                "&tr=" + Uri.encode(transactionRef) +
                "&tn=" + Uri.encode(note);

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(uri));

            Intent chooser = Intent.createChooser(intent, "Pay with UPI");
            getActivity().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("transactionRef", transactionRef);

            call.resolve(result);
        } catch (Exception e) {
            call.reject("No compatible UPI application found", e);
        }
    }
}
