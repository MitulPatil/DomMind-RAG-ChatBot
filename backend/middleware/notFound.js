export function notFound(req,res,next){
    const err = new Error("Route not Found");
    err.status = 404;
    return next(err); 
}