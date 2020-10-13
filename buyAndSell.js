/**
 * Halts the program from running temporarily to prevent it from hitting API call limits
 * 
 * @param {number} ms -> the number of miliseconds to wait 
 */
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
} 

/**
 * 
 * @param {*} balance 
 * @param {*} accountIds 
 * @param {*} positionInfo 
 * @param {*} currentPrice 
 * @param {*} orderPriceDelta 
 * @param {*} authedClient 
 * @param {*} coinbaseLibObject 
 * @param {*} productInfo 
 */
async function sellPosition(balance, accountIds, positionInfo, currentPrice, authedClient, coinbaseLibObject, productInfo, depositConfig, tradingConfig) {
    try {
        const priceToSell = (currentPrice - (currentPrice * tradingConfig.orderPriceDelta)).toFixed(productInfo.quoteIncrementRoundValue);

        let orderSize;
        if (productInfo.baseIncrementRoundValue === 0) {
            orderSize = Math.trunc(balance);
        } else {
            orderSize = (balance).toFixed(productInfo.baseIncrementRoundValue);
        }

        const orderParams = {
            side: "sell",
            price: priceToSell, 
            size: orderSize,
            product_id: productInfo.productPair,
        };

        console.log("Sell order params: " + JSON.stringify(orderParams));

        const order = await authedClient.placeOrder(orderParams);
        console.log(order);
        const orderID = order.id;

        //Loop to wait for order to be filled:
        for (let i = 0; i < 10 && positionInfo.positionExists === true; ++i) {
            console.log("Checking sell order result...");
            await sleep(6000);
            const orderDetails = await authedClient.getOrder(orderID);
            console.log(orderDetails);

            if (orderDetails.status === "done") {
                if (orderDetails.done_reason !== "filled") {
                    throw new Error("Sell order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
                } else {
                    positionInfo.positionExists = false;

                    let profit = parseFloat(orderDetails.executed_value) - parseFloat(orderDetails.fill_fees) - positionInfo.positionAcquiredCost;
                    console.log("Profit: " + profit);

                    if (profit > 0) {
                        if (depositConfig.depositingEnabled) {
                            const transferAmount = (profit * depositConfig.depositingAmount).toFixed(2);
                            const currency = productInfo.quoteCurrency;

                            //transfer funds to depositProfileID
                            const transferResult = await coinbaseLibObject.profileTransfer(accountIds.tradeProfileID, accountIds.depositProfileID, currency, transferAmount);
                            
                            console.log("transfer result: " + transferResult);
                        }
                    } else {
                        throw new Error("Sell was not profitable, terminating program. profit: " + profit);
                    }
                }
            }
        }

        if (positionInfo.positionExists === true) {
            const cancelOrder = await authedClient.cancelOrder(orderID);
            if (cancelOrder !== orderID) {
                throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
            }
        }

    } catch (err) {
        const message = "Error occured in sellPosition method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
    }
}

/**
 * 
 * @param {*} balance 
 * @param {*} positionInfo 
 * @param {*} highestFee 
 * @param {*} currentPrice 
 * @param {*} orderPriceDelta 
 * @param {*} authedClient 
 * @param {*} productInfo 
 */
async function buyPosition(balance, positionInfo, currentPrice, authedClient, productInfo, tradingConfig) {
    try {
        const amountToSpend = balance - (balance * tradingConfig.highestFee);
        const priceToBuy = (currentPrice + (currentPrice * tradingConfig.orderPriceDelta)).toFixed(productInfo.quoteIncrementRoundValue);
        let orderSize;

        if (productInfo.baseIncrementRoundValue === 0) {
            orderSize = Math.trunc(amountToSpend / priceToBuy);
        } else {
            orderSize = (amountToSpend / priceToBuy).toFixed(productInfo.baseIncrementRoundValue);
        }

        const orderParams = {
            side: "buy",
            price: priceToBuy, 
            size: orderSize, 
            product_id: productInfo.productPair,
        };

        console.log("Buy order params: " + JSON.stringify(orderParams));
        
        const order = await authedClient.placeOrder(orderParams);
        console.log(order);
        const orderID = order.id;

        //Loop to wait for order to be filled:
        for (let i = 0; i < 10 && positionInfo.positionExists === false; ++i) {
            console.log("Checking buy order result...");
            await sleep(6000);
            const orderDetails = await authedClient.getOrder(orderID);
            console.log(orderDetails);

            if (orderDetails.status === "done") {
                if (orderDetails.done_reason !== "filled") {
                    throw new Error("Buy order did not complete due to being filled? done_reason: " + orderDetails.done_reason);
                } else {
                    positionInfo.positionExists = true;
                    positionInfo.positionAcquiredPrice = parseFloat(orderDetails.executed_value) / parseFloat(orderDetails.filled_size);
                    positionInfo.positionAcquiredCost = parseFloat(orderDetails.executed_value)  + parseFloat(orderDetails.fill_fees);

                    console.log(positionInfo);
                }
            }
        }

        if (positionInfo.positionExists === false) {
            const cancelOrder = await authedClient.cancelOrder(orderID);
            if (cancelOrder !== orderID) {
                throw new Error("Attempted to cancel failed order but it did not work. cancelOrderReturn: " + cancelOrder + "orderID: " + orderID);
            }
        }

    } catch (err) {
        const message = "Error occured in buyPosition method.";
        const errorMsg = new Error(err);
        console.log({ message, errorMsg, err });
    }
}

module.exports = {
    sellPosition,
    buyPosition,
}