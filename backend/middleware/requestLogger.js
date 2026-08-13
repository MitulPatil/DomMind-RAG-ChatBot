export function requestLogger(req,res,next){
    const start = Date.now();

    console.log(`${start}-${req.method} ${req.url}`);

    res.on('finish',()=>{
        const duration = Date.now() - start;
        console.log(`${res.statusCode} ${req.method} ${req.url} ${duration}ms`);
    })

    next();
}