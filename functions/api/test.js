export async function onRequest(context) {
    return Response.json({
        success: true,
        message: "BUP ICE API is working!"
    });
}
