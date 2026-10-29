export async function onRequest(context) {
    try {
        const DB = context.env.DB;

        const result = await DB.prepare(
            "SELECT * FROM notices ORDER BY created_at DESC LIMIT 100"
        ).all();

        return Response.json({
            success: true,
            message: "Database Connected Successfully!",
            notices: result.results
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
